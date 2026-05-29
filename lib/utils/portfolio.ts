import fetch from 'node-fetch'
import { networks as commonNetworks } from 'ambire-common/dist/src/consts/networks'
import { Network } from 'ambire-common/dist/src/interfaces/network'
import { Fetch } from 'ambire-common/dist/src/interfaces/fetch'
import { getRpcProvider } from 'ambire-common/dist/src/services/provider/getRpcProvider'
import { Portfolio } from 'ambire-common/dist/src/libs/portfolio'
import { llmMockProcess } from './llm/mockedAI'
import { simplePrompt } from './prompts'
import { EMPTY_PORTFOLIO_STRATEGIES } from './strategies'
import {
    PortfolioForNetwork,
    ProcessAddressProps,
    AuraResponse_01,
    NetworkPortfolioLibResponse,
    PortfolioNetworkInfo
} from '../types'
import { stringifyError } from '..'

export async function getPortfolioForNetwork(
    address: string,
    network: Network,
    customFetch?: Fetch
): Promise<NetworkPortfolioLibResponse> {
    const provider = getRpcProvider(network.rpcUrls, network.chainId, network.selectedRpcUrl)
    const portfolio = new Portfolio(
        customFetch || fetch,
        provider,
        network,
        'https://relayer.ambire.com/velcro-v3'
    )

    return portfolio
        .get(address, { baseCurrency: 'usd' })
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

    const responses = await Promise.all(
        networks.map((network) => getPortfolioForNetwork(address, network, customFetch))
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
