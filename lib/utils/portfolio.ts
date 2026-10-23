import fetch from 'node-fetch'
import { networks as commonNetworks } from 'ambire-common/dist/src/consts/networks'
import { Network } from 'ambire-common/dist/src/interfaces/network'
import { Fetch } from 'ambire-common/dist/src/interfaces/fetch'
import { getRpcProvider } from 'ambire-common/dist/src/services/provider/getRpcProvider'
import { Portfolio } from 'ambire-common/dist/src/libs/portfolio'
import {
    convertApiTokenDataToTokenDataCache,
    formatExternalHintsAPIResponse,
    getTokenDataCacheKey
} from 'ambire-common/dist/src/libs/portfolio/helpers'
import {
    ExternalPortfolioDiscoveryResponse,
    TokenDataCache
} from 'ambire-common/dist/src/libs/portfolio/interfaces'
import { getFormattedApiPositions } from 'ambire-common/dist/src/libs/defiPositions/defiPositions'
import { AssetType } from 'ambire-common/dist/src/libs/defiPositions/types'
import { llmMockProcess } from './llm/mockedAI'
import { simplePrompt } from './prompts'
import { EMPTY_PORTFOLIO_STRATEGIES } from './strategies'
import { timeoutPromise } from './timing'
import {
    PortfolioForNetwork,
    ProcessAddressProps,
    AuraResponse_01,
    NetworkPortfolioLibResponse,
    PortfolioNetworkInfo,
    PortfolioLibToken,
    PortfolioToken,
    DefiMode,
    PortfolioDefiAssetType,
    PortfolioDefiPosition,
    PortfolioWithDefiForNetwork
} from '../types'
import { stringifyError } from '..'

const VELCRO_URL = 'https://relayer.ambire.com/velcro-v3'
const VELCRO_TIMEOUT_SECONDS = 6
// Velcro may refetch the DeFi positions before it responds, and the token hints come in the same response
const VELCRO_DEFI_TIMEOUT_SECONDS = 30

const DEFI_ASSET_TYPES: Record<AssetType, PortfolioDefiAssetType> = {
    [AssetType.Liquidity]: 'liquidity',
    [AssetType.Collateral]: 'collateral',
    [AssetType.Borrow]: 'borrow',
    [AssetType.Reward]: 'reward',
    [AssetType.Margin]: 'margin',
    [AssetType.Perpetual]: 'perpetual',
    [AssetType.Prediction]: 'prediction'
}

// One Velcro request for all networks. It returns the token and NFT addresses the account
// probably holds and some prices, but no balances - those are read on-chain by the Portfolio lib.
// It also returns the DeFi positions, as fresh as `defiMode` asks for
export async function getPortfolioDiscovery(
    address: string,
    networks: Network[] = commonNetworks,
    customFetch?: Fetch,
    defiMode: DefiMode = 'cache'
): Promise<ExternalPortfolioDiscoveryResponse[]> {
    const fetchFn: Fetch = customFetch || fetch
    const chainIds = networks.map((n) => n.chainId.toString()).join(',')
    const url = `${VELCRO_URL}/portfolio?networks=${chainIds}&account=${address}&baseCurrency=usd&defi=${defiMode}`
    const timeoutSeconds =
        defiMode === 'cache' ? VELCRO_TIMEOUT_SECONDS : VELCRO_DEFI_TIMEOUT_SECONDS

    const request = fetchFn(url).then(async (response) => {
        const body = await response.json()

        if (!response.ok || !Array.isArray(body)) {
            throw new Error(
                body?.message || body?.error || `Velcro responded with ${response.status}`
            )
        }

        return body
    })

    return timeoutPromise(request, timeoutSeconds, 'Velcro discovery timed out')
}

export async function getPortfolioForNetwork(
    address: string,
    network: Network,
    customFetch?: Fetch,
    // Without it only the native token, gas tank fee tokens and pinned tokens are checked
    discovery?: ExternalPortfolioDiscoveryResponse
): Promise<NetworkPortfolioLibResponse> {
    const provider = getRpcProvider(network.rpcUrls, network.chainId, network.selectedRpcUrl)
    const portfolio = new Portfolio(customFetch || fetch, provider, network)
    const hints = discovery ? formatExternalHintsAPIResponse(discovery) : null

    // Tokens priced here aren't requested from cena again
    const tokenDataCache: TokenDataCache = new Map()
    Object.entries(discovery?.prices || {}).forEach(([tokenAddress, priceData]) => {
        if (typeof priceData?.price !== 'number') return

        tokenDataCache.set(getTokenDataCacheKey(tokenAddress), [
            Date.now(),
            convertApiTokenDataToTokenDataCache(priceData)
        ])
    })

    return portfolio
        .get(address, {
            baseCurrency: 'usd',
            // Without it the lib calls the deprecated /velcro-v3/multi-hints endpoint
            disableAutoDiscovery: true,
            additionalErc20Hints: hints?.erc20s ?? [],
            additionalErc721Hints: hints?.erc721s ?? {},
            // Passing it, even empty, turns on the lib's token filter. It drops the hinted tokens with
            // no balance and ERC-20 copies of the native token (e.g. POL on Polygon), counted twice otherwise
            specialErc20Hints: { custom: [], hidden: [], learn: [] },
            tokenDataCache
        })
        .then((data) => data)
        .catch((err) => {
            const error = stringifyError(err)
            console.error(`Error fetching portfolio for network ${network.name}: ${error}`)

            return {
                tokens: [],
                error
            }
        })
}

function formatPortfolioTokens(tokens: PortfolioLibToken[]): PortfolioToken[] {
    return tokens
        .filter((t) => t.amount > 0n)
        .map((t) => {
            const balance = Number(t.amount) / Math.pow(10, t.decimals)
            const priceUSD = (t.priceIn.find((p) => p.baseCurrency === 'usd') || { price: 0 }).price
            const priceChange24h =
                (t.marketDataIn.find((p) => p.baseCurrency === 'usd') || { change24h: 0 })
                    .change24h || 0

            return {
                symbol: t.symbol,
                balanceRaw: t.amount.toString(),
                balance,
                balanceUSD: balance * priceUSD,
                address: t.address,
                decimals: t.decimals,
                priceUSD,
                priceChange24h
            }
        })
}

function getNetworkInfo(network: Network): PortfolioNetworkInfo {
    return {
        name: network.name,
        chainId: network.chainId.toString(),
        platformId: network.platformId,
        explorerUrl: network.explorerUrl || '',
        iconUrls: network.iconUrls || []
    }
}

// Velcro groups the positions by provider, here they are flattened to one entry per position
function formatDefiPositions(
    network: Network,
    discovery?: ExternalPortfolioDiscoveryResponse
): PortfolioDefiPosition[] | null {
    if (!discovery) return null

    const { defi } = discovery
    if (!defi || 'errorState' in defi) {
        const error = defi?.errorState[0]?.message || 'Unknown error'
        console.error(`Error fetching DeFi positions for network ${network.name}: ${error}`)
        return null
    }

    // An account with no DeFi positions gets an empty object back, not an error
    const providers = getFormattedApiPositions('positions' in defi ? defi.positions || [] : [])

    return providers.flatMap((provider) =>
        provider.positions.map((position) => ({
            providerName: provider.providerName,
            providerUrl: provider.siteUrl,
            providerIconUrl: provider.iconUrl,
            name: position.additionalData.name,
            poolId: position.additionalData.pool?.id,
            healthRate: position.additionalData.healthRate ?? undefined,
            balanceUSD: position.additionalData.positionInUSD || 0,
            assets: position.assets.map((asset) => {
                const balance = Number(asset.amount) / Math.pow(10, asset.decimals)
                const priceUSD = asset.priceIn?.price || 0

                return {
                    address: asset.address,
                    balanceRaw: asset.amount.toString(),
                    balance,
                    balanceUSD: asset.value ?? balance * priceUSD,
                    symbol: asset.symbol,
                    decimals: asset.decimals,
                    priceUSD,
                    type: DEFI_ASSET_TYPES[asset.type]
                }
            })
        }))
    )
}

// One Velcro request for all networks, then the token balances of each network
async function getNetworkPortfolios(
    address: string,
    networks: Network[],
    customFetch: Fetch | undefined,
    defiMode: DefiMode
) {
    // Without discovery fewer tokens are found, but the portfolio is still usable
    const discovery = await getPortfolioDiscovery(address, networks, customFetch, defiMode).catch(
        (err) => {
            console.error(
                `Error fetching portfolio discovery for ${address}: ${stringifyError(err)}`
            )
            return []
        }
    )

    return Promise.all(
        networks.map(async (network) => {
            // Velcro returns some chain ids as numbers and others as strings
            const networkDiscovery = discovery.find(
                (entry) => String(entry.chainId) === network.chainId.toString()
            )
            const { tokens } = await getPortfolioForNetwork(
                address,
                network,
                customFetch,
                networkDiscovery
            )

            return { network, discovery: networkDiscovery, tokens: formatPortfolioTokens(tokens) }
        })
    )
}

export async function getPortfolioVelcroV3(
    address: string,
    networks: Network[] = commonNetworks,
    customFetch?: Fetch
): Promise<PortfolioForNetwork[]> {
    // DeFi positions aren't used, so Velcro can return its cached ones instead of refreshing them
    const networkPortfolios = await getNetworkPortfolios(address, networks, customFetch, 'cache')

    return networkPortfolios
        .filter(({ tokens }) => tokens.length > 0)
        .map(({ network, tokens }) => ({ network: getNetworkInfo(network), tokens }))
}

// The same as getPortfolioVelcroV3, plus the DeFi positions from the same Velcro request.
// Networks with DeFi positions but no tokens are included too
export async function getPortfolioWithDefiVelcroV3(
    address: string,
    networks: Network[] = commonNetworks,
    customFetch?: Fetch,
    defiMode: DefiMode = 'default'
): Promise<PortfolioWithDefiForNetwork[]> {
    const networkPortfolios = await getNetworkPortfolios(address, networks, customFetch, defiMode)

    return networkPortfolios
        .map(({ network, discovery, tokens }) => ({
            network: getNetworkInfo(network),
            tokens,
            defiPositions: formatDefiPositions(network, discovery)
        }))
        .filter(({ tokens, defiPositions }) => tokens.length > 0 || !!defiPositions?.length)
}

export const processAddress = async (
    {
        address,
        getPortfolio,
        makePrompt,
        llmProcessor,
        model,
        llmOptionsOverride
    }: ProcessAddressProps = {
        address: '0x69bfD720Dd188B8BB04C4b4D24442D3c15576D10',
        getPortfolio: getPortfolioVelcroV3,
        makePrompt: simplePrompt,
        llmProcessor: llmMockProcess
    }
): Promise<AuraResponse_01> => {
    const portfolio = await getPortfolio(address)

    if (!portfolio.length) {
        return {
            address,
            portfolio,
            strategies: [
                {
                    llm: {
                        provider: 'local',
                        model: 'local'
                    },
                    response: EMPTY_PORTFOLIO_STRATEGIES,
                    inputTokens: 0,
                    outputTokens: 0
                }
            ]
        }
    }

    const prompt = await makePrompt({ portfolio })
    const strategies = await llmProcessor({ prompt, model, llmOptionsOverride })

    return {
        address,
        portfolio,
        strategies: [strategies]
    }
}
