import fetch from 'node-fetch'
import { EMPTY_PORTFOLIO_STRATEGIES } from '../../lib'
import {
    LlmProcessOutput,
    NetworkPortfolioLibResponse,
    PortfolioLibToken,
    StrategyRisk
} from '../../lib/types'
import {
    getPortfolioDiscovery,
    getPortfolioForNetwork,
    getPortfolioVelcroV3,
    processAddress
} from '../../lib/utils/portfolio'
import { simplePrompt } from '../../lib/utils/prompts'
import { networks as commonNetworks } from 'ambire-common/dist/src/consts/networks'
import { Network } from 'ambire-common/dist/src/interfaces/network'
import { Portfolio } from 'ambire-common/dist/src/libs/portfolio'
import {
    ExternalAPITokenMarketDataResponse,
    ExternalPortfolioDiscoveryResponse
} from 'ambire-common/dist/src/libs/portfolio/interfaces'

const TEST_WALLET = '0x69bfD720Dd188B8BB04C4b4D24442D3c15576D10'
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const NFT_WITH_IDS = '0x1111111111111111111111111111111111111111'
const NFT_ENUMERABLE = '0x2222222222222222222222222222222222222222'
const USDC_PRICE = 0.99
// Velcro sends only these fields, while the lib's type also requires the ones cena sends
const velcroPrice = (price?: number) =>
    ({ baseCurrency: 'usd', price }) as ExternalAPITokenMarketDataResponse
const mockedNetworkPortfolioResult: NetworkPortfolioLibResponse = {
    tokens: [
        {
            symbol: 'USDC',
            address: USDC_ADDRESS,
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
const mockedDiscovery: ExternalPortfolioDiscoveryResponse = {
    networkId: 'ethereum',
    chainId: 1,
    accountAddr: TEST_WALLET,
    erc20s: [USDC_ADDRESS],
    erc721s: {
        [NFT_WITH_IDS]: { isKnown: false, tokens: ['1', '2'] },
        [NFT_ENUMERABLE]: { isKnown: false, enumerable: true }
    },
    prices: { [USDC_ADDRESS]: velcroPrice(USDC_PRICE) },
    hasHints: true,
    lastUpdate: 0,
    defi: { positions: [], updatedAt: 0 },
    otherNetworksDefiCounts: {}
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

const mockFetchResponse = (body: any, status = 200) =>
    Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body)
    })

jest.mock('node-fetch', () => jest.fn())
const mockedFetch = fetch as unknown as jest.Mock

jest.mock('ambire-common/dist/src/consts/networks', () => {
    const actual = jest.requireActual('ambire-common/dist/src/consts/networks')
    return {
        networks: actual.networks.filter((n: any) => ['Ethereum'].includes(n.name))
    }
})

const mockPortfolioGet = jest.fn()
jest.mock('ambire-common/dist/src/libs/portfolio', () => {
    return {
        Portfolio: jest.fn().mockImplementation(() => ({
            get: mockPortfolioGet
        }))
    }
})

describe('Portfolio unit tests', () => {
    const ethereum = commonNetworks.find((n: Network) => n.name === 'Ethereum') as Network

    beforeEach(() => {
        jest.clearAllMocks()
        mockPortfolioGet.mockReturnValue(Promise.resolve(mockedNetworkPortfolioResult))
        mockedFetch.mockImplementation(() => mockFetchResponse([mockedDiscovery]))
    })

    test('should successfully get portfolio for address on ethereum', async () => {
        const res = await getPortfolioForNetwork(TEST_WALLET, ethereum)

        expect(res).toHaveProperty('tokens')
        expect(res.tokens).toHaveLength(1)
        expect(res.tokens[0]).toBe<PortfolioLibToken>(mockedNetworkPortfolioResult.tokens[0])
    })

    test('should pass the discovery hints and prices to the portfolio lib', async () => {
        await getPortfolioForNetwork(TEST_WALLET, ethereum, undefined, mockedDiscovery)

        // No Velcro URL, so the lib can't reach /multi-hints
        expect((Portfolio as unknown as jest.Mock).mock.calls[0][3]).toBeUndefined()
        expect(mockPortfolioGet).toHaveBeenCalledTimes(1)

        const [address, options] = mockPortfolioGet.mock.calls[0]
        expect(address).toEqual(TEST_WALLET)
        expect(options.disableAutoDiscovery).toBe(true)
        expect(options.additionalErc20Hints).toEqual([USDC_ADDRESS])
        expect(options.additionalErc721Hints).toEqual({
            [NFT_WITH_IDS]: [1n, 2n],
            [NFT_ENUMERABLE]: []
        })
        expect(options.specialErc20Hints).toEqual({ custom: [], hidden: [], learn: [] })
        expect(options.tokenDataCache.get(USDC_ADDRESS.toLowerCase())[1].priceIn).toEqual([
            { baseCurrency: 'usd', price: USDC_PRICE }
        ])
    })

    test('should get portfolio for network without discovery and without hints', async () => {
        await getPortfolioForNetwork(TEST_WALLET, ethereum)

        const [, options] = mockPortfolioGet.mock.calls[0]
        expect(options.disableAutoDiscovery).toBe(true)
        expect(options.additionalErc20Hints).toEqual([])
        expect(options.additionalErc721Hints).toEqual({})
        expect(options.tokenDataCache.size).toEqual(0)
    })

    test('should skip discovery prices that are not numbers', async () => {
        await getPortfolioForNetwork(TEST_WALLET, ethereum, undefined, {
            ...mockedDiscovery,
            prices: { [USDC_ADDRESS]: velcroPrice() }
        })

        const [, options] = mockPortfolioGet.mock.calls[0]
        expect(options.tokenDataCache.size).toEqual(0)
    })

    test('should request discovery for all networks from the velcro-v3 portfolio endpoint', async () => {
        const customFetch = jest.fn(() => mockFetchResponse([mockedDiscovery]))
        const res = await getPortfolioDiscovery(TEST_WALLET, commonNetworks, customFetch as any)

        expect(res).toEqual([mockedDiscovery])
        expect(mockedFetch).not.toHaveBeenCalled()
        expect(customFetch).toHaveBeenCalledTimes(1)

        const url = new URL((customFetch.mock.calls[0] as any)[0])
        expect(url.origin + url.pathname).toEqual('https://relayer.ambire.com/velcro-v3/portfolio')
        expect(url.searchParams.get('networks')).toEqual('1')
        expect(url.searchParams.get('account')).toEqual(TEST_WALLET)
        expect(url.searchParams.get('baseCurrency')).toEqual('usd')
    })

    test('should throw when discovery responds with an error', async () => {
        mockedFetch.mockImplementation(() => mockFetchResponse({ message: 'Invalid account' }))
        await expect(getPortfolioDiscovery(TEST_WALLET)).rejects.toThrow('Invalid account')

        mockedFetch.mockImplementation(() => mockFetchResponse({}, 500))
        await expect(getPortfolioDiscovery(TEST_WALLET)).rejects.toThrow(
            'Velcro responded with 500'
        )
    })

    test('should successfully get portfolio for address on all configured networks', async () => {
        const res = await getPortfolioVelcroV3(TEST_WALLET)

        expect(mockedFetch).toHaveBeenCalledTimes(1)
        expect(mockPortfolioGet.mock.calls[0][1].additionalErc20Hints).toEqual([USDC_ADDRESS])

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

    test('should match discovery entries whose chainId is a string', async () => {
        mockedFetch.mockImplementation(() =>
            mockFetchResponse([{ ...mockedDiscovery, chainId: '1' }])
        )
        await getPortfolioVelcroV3(TEST_WALLET)

        expect(mockPortfolioGet.mock.calls[0][1].additionalErc20Hints).toEqual([USDC_ADDRESS])
    })

    test('should still get portfolio without hints when discovery fails', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
        mockedFetch.mockImplementation(() => Promise.reject(new Error('Network down')))

        const res = await getPortfolioVelcroV3(TEST_WALLET)

        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Network down'))
        expect(mockPortfolioGet).toHaveBeenCalledTimes(1)
        expect(mockPortfolioGet.mock.calls[0][1].additionalErc20Hints).toEqual([])
        expect(res).toHaveLength(1)

        consoleError.mockRestore()
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
