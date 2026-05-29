import { EMPTY_PORTFOLIO_STRATEGIES } from '../../lib'
import {
    LlmProcessOutput,
    NetworkPortfolioLibResponse,
    PortfolioLibToken,
    StrategyRisk
} from '../../lib/types'
import {
    getPortfolioForNetwork,
    getPortfolioVelcroV3,
    processAddress
} from '../../lib/utils/portfolio'
import { simplePrompt } from '../../lib/utils/prompts'
import { networks as commonNetworks } from 'ambire-common/dist/src/consts/networks'
import { Network } from 'ambire-common/dist/src/interfaces/network'

const TEST_WALLET = '0x69bfD720Dd188B8BB04C4b4D24442D3c15576D10'
const USDC_PRICE = 0.99
const mockedNetworkPortfolioResult: NetworkPortfolioLibResponse = {
    tokens: [
        {
            symbol: 'USDC',
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            chainId: 1n,
            decimals: 6,
            amount: 50000000n,
            priceIn: [
                {
                    baseCurrency: 'usd',
                    price: USDC_PRICE
                }
            ],
            marketDataIn: [
                {
                    baseCurrency: 'usd',
                    change24h: 0.05
                }
            ]
        }
    ]
}
const mockedLlmOutput: LlmProcessOutput = {
    llm: {
        provider: 'mock',
        model: 'mock'
    },
    response: [
        {
            actions: [
                {
                    description: 'Example USDC strategy description',
                    tokens: 'USDC, ETH'
                }
            ],
            name: 'Example USDC strategy name',
            risk: StrategyRisk.LOW
        }
    ],
    inputTokens: 0,
    outputTokens: 0
}

jest.mock('ambire-common/dist/src/consts/networks', () => {
    const actual = jest.requireActual('ambire-common/dist/src/consts/networks')
    return {
        networks: actual.networks.filter((n: any) => ['Ethereum'].includes(n.name))
    }
})

jest.mock('ambire-common/dist/src/libs/portfolio', () => {
    return {
        Portfolio: jest.fn().mockImplementation(() => ({
            get: jest.fn().mockReturnValue(Promise.resolve(mockedNetworkPortfolioResult))
        }))
    }
})

describe('Portfolio unit tests', () => {
    test('should successfully get portfolio for address on ethereum', async () => {
        const network = commonNetworks.find((n: Network) => n.name === 'Ethereum') as Network
        const res = await getPortfolioForNetwork(TEST_WALLET, network)

        expect(res).toHaveProperty('tokens')
        expect(res.tokens).toHaveLength(1)
        expect(res.tokens[0]).toBe<PortfolioLibToken>(mockedNetworkPortfolioResult.tokens[0])
    })

    test('should successfully get portfolio for address on all configured networks', async () => {
        const res = await getPortfolioVelcroV3(TEST_WALLET)

        expect(res).toHaveLength(1)
        expect(res[0]).toHaveProperty('network')
        expect(res[0]).toHaveProperty('tokens')
        expect(res[0].network.name).toEqual('Ethereum')
        expect(res[0].tokens).toHaveLength(1)

        const mockedLibToken = mockedNetworkPortfolioResult.tokens[0]
        expect(res[0].tokens[0].symbol).toEqual(mockedLibToken.symbol)
        expect(res[0].tokens[0].address).toEqual(mockedLibToken.address)

        const expectedBalance =
            Number(mockedLibToken.amount) / Math.pow(10, mockedLibToken.decimals)
        expect(res[0].tokens[0].balance).toEqual(expectedBalance)
        expect(res[0].tokens[0].balanceUSD).toEqual(expectedBalance * USDC_PRICE)
    })

    test('should process address, get portfolio and return suggested strategies', async () => {
        const res = await processAddress({
            address: TEST_WALLET,
            getPortfolio: getPortfolioVelcroV3,
            makePrompt: simplePrompt,
            llmProcessor: () => Promise.resolve(mockedLlmOutput)
        })

        expect(res).toHaveProperty('address')
        expect(res).toHaveProperty('portfolio')
        expect(res).toHaveProperty('strategies')
        expect(res.address).toEqual(TEST_WALLET)
        expect(res.portfolio).toHaveLength(1)
        expect(res.strategies).toHaveLength(1)
        expect(res.strategies[0]).toBe(mockedLlmOutput)
    })

    test('should process address with empty portfolio and get hardcoded strategy for it', async () => {
        const res = await processAddress({
            address: TEST_WALLET,
            getPortfolio: () => Promise.resolve([]),
            makePrompt: simplePrompt,
            llmProcessor: () => Promise.resolve(mockedLlmOutput)
        })

        expect(res).toHaveProperty('address')
        expect(res).toHaveProperty('portfolio')
        expect(res).toHaveProperty('strategies')
        expect(res.address).toEqual(TEST_WALLET)
        expect(res.portfolio).toHaveLength(0)
        expect(res.strategies).toHaveLength(1)
        expect(res.strategies[0].response).toBe(EMPTY_PORTFOLIO_STRATEGIES)
    })
})
