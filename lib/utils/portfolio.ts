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
import { llmMockProcess } from './llm/mockedAI'
import { simplePrompt } from './prompts'
import { EMPTY_PORTFOLIO_STRATEGIES } from './strategies'
import { timeoutPromise } from './timing'
import {
    PortfolioForNetwork,
    ProcessAddressProps,
    AuraResponse_01,
    NetworkPortfolioLibResponse,
    PortfolioNetworkInfo
} from '../types'
import { stringifyError } from '..'

const VELCRO_URL = 'https://relayer.ambire.com/velcro-v3'
const VELCRO_TIMEOUT_SECONDS = 6

// One Velcro request for all networks. It returns the token and NFT addresses the account
// probably holds and some prices, but no balances - those are read on-chain by the Portfolio lib
export async function getPortfolioDiscovery(
    address: string,
    networks: Network[] = commonNetworks,
    customFetch?: Fetch
): Promise<ExternalPortfolioDiscoveryResponse[]> {
    const fetchFn: Fetch = customFetch || fetch
    const chainIds = networks.map((n) => n.chainId.toString()).join(',')
    // DeFi positions aren't used, so Velcro can return its cached ones instead of refreshing them
    const url = `${VELCRO_URL}/portfolio?networks=${chainIds}&account=${address}&baseCurrency=usd&defi=cache`

    const request = fetchFn(url).then(async (response) => {
        const body = await response.json()

        if (!response.ok || !Array.isArray(body)) {
            throw new Error(
                body?.message || body?.error || `Velcro responded with ${response.status}`
            )
        }

        return body
    })

    return timeoutPromise(request, VELCRO_TIMEOUT_SECONDS, 'Velcro discovery timed out')
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

export async function getPortfolioVelcroV3(
    address: string,
    networks: Network[] = commonNetworks,
    customFetch?: Fetch
): Promise<PortfolioForNetwork[]> {
    const output: PortfolioForNetwork[] = []

    // Without discovery fewer tokens are found, but the portfolio is still usable
    const discovery = await getPortfolioDiscovery(address, networks, customFetch).catch((err) => {
        console.error(`Error fetching portfolio discovery for ${address}: ${stringifyError(err)}`)
        return []
    })

    const responses = await Promise.all(
        networks.map((network) =>
            getPortfolioForNetwork(
                address,
                network,
                customFetch,
                // Velcro returns some chain ids as numbers and others as strings
                discovery.find((entry) => String(entry.chainId) === network.chainId.toString())
            )
        )
    )

    for (const resp of responses) {
        const tokens = resp.tokens
            .filter((t) => t.amount > 0n)
            .map((t) => {
                const balance = Number(t.amount) / Math.pow(10, t.decimals)
                const priceUSD = (t.priceIn.find((p) => p.baseCurrency === 'usd') || { price: 0 })
                    .price
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

        if (!tokens.length) {
            continue
        }

        const matchedNetwork = networks.find((n) => n.chainId === resp.tokens[0].chainId) as Network
        const networkInfo: PortfolioNetworkInfo = {
            name: matchedNetwork.name,
            chainId: matchedNetwork.chainId.toString(),
            platformId: matchedNetwork.platformId,
            explorerUrl: matchedNetwork.explorerUrl || '',
            iconUrls: matchedNetwork.iconUrls || []
        }

        output.push({
            network: networkInfo,
            tokens
        })
    }

    return output
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
