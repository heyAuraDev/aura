import fetch from 'node-fetch'
import { EMPTY_PORTFOLIO_STRATEGIES } from '../../lib'
import {
    LlmProcessOutput,
    NetworkPortfolioLibResponse,
    PortfolioDefiPosition,
    PortfolioLibToken,
    StrategyRisk
} from '../../lib/types'
import {
    getPortfolioDiscovery,
    getPortfolioForNetwork,
    getPortfolioVelcroV3,
    getPortfolioWithDefiVelcroV3,
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
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const AAVE_POOL = '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
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
// Shaped like the raw Velcro JSON. The lib's type describes the positions after
// getFormattedApiPositions, which also changes them in place, so each test gets a new copy
const velcroDefi = () =>
    ({
        positions: [
            {
                providerName: 'Aave V3',
                chainId: 1,
                iconUrl: 'https://example.com/aave.png',
                siteUrl: 'https://app.aave.com',
                type: 'lending',
                positionInUSD: 4000,
                positions: [
                    {
                        id: 'aave-1',
                        assets: [
                            {
                                address: WETH_ADDRESS.toLowerCase(),
                                symbol: 'WETH',
                                name: 'Wrapped Ether',
                                decimals: 18,
                                amount: '2000000000000000000',
                                priceIn: { price: 2500, baseCurrency: 'usd' },
                                value: 5000,
                                type: 1
                            },
                            {
                                address: USDC_ADDRESS.toLowerCase(),
                                symbol: 'USDC',
                                name: 'USD Coin',
                                decimals: 6,
                                amount: '1000000000',
                                priceIn: { price: 1, baseCurrency: 'usd' },
                                value: 1000,
                                type: 2
                            }
                        ],
                        additionalData: {
                            name: 'Lending',
                            healthRate: 1.8,
                            positionInUSD: 4000,
                            collateralInUSD: 5000,
                            // Misspelled and negative, as Velcro sends it
                            deptInUSD: -1000,
                            pool: { id: AAVE_POOL }
                        }
                    }
                ]
            },
            {
                providerName: 'Lido',
                chainId: 1,
                iconUrl: 'https://example.com/lido.png',
                siteUrl: 'https://lido.fi',
                type: 'common',
                positionInUSD: 1250,
                positions: [
                    {
                        id: 'lido-1',
                        assets: [
                            {
                                // DeBank's id for the native token, without a value
                                address: 'eth',
                                symbol: 'ETH',
                                name: 'Ether',
                                decimals: 18,
                                amount: '500000000000000000',
                                priceIn: { price: 2500, baseCurrency: 'usd' },
                                type: 0
                            }
                        ],
                        additionalData: { name: 'Staked', positionInUSD: 1250 }
                    }
                ]
            }
        ],
        updatedAt: 0
    }) as unknown as ExternalPortfolioDiscoveryResponse['defi']
const expectedDefiPositions: PortfolioDefiPosition[] = [
    {
        providerName: 'Aave V3',
        providerUrl: 'https://app.aave.com',
        providerIconUrl: 'https://example.com/aave.png',
        name: 'Lending',
        poolId: AAVE_POOL,
        healthRate: 1.8,
        balanceUSD: 4000,
        collateralUSD: 5000,
        debtUSD: 1000,
        assets: [
            {
                address: WETH_ADDRESS,
                balanceRaw: '2000000000000000000',
                balance: 2,
                balanceUSD: 5000,
                symbol: 'WETH',
                decimals: 18,
                priceUSD: 2500,
                type: 'collateral'
            },
            {
                address: USDC_ADDRESS,
                balanceRaw: '1000000000',
                balance: 1000,
                balanceUSD: 1000,
                symbol: 'USDC',
                decimals: 6,
                priceUSD: 1,
                type: 'borrow'
            }
        ]
    },
    {
        providerName: 'Lido',
        providerUrl: 'https://lido.fi',
        providerIconUrl: 'https://example.com/lido.png',
        name: 'Staked',
        balanceUSD: 1250,
        assets: [
            {
                address: ZERO_ADDRESS,
                balanceRaw: '500000000000000000',
                balance: 0.5,
                balanceUSD: 1250,
                symbol: 'ETH',
                decimals: 18,
                priceUSD: 2500,
                type: 'liquidity'
            }
        ]
    }
]
// Shaped like the raw Velcro JSON for apps: decimal amounts, a top-level price and no addresses
const velcroApps = () =>
    ({
        networkId: 'customAppChain',
        chainId: 'customAppChain',
        accountAddr: TEST_WALLET,
        defi: {
            positions: [
                {
                    providerName: 'Hyperliquid',
                    iconUrl: 'https://example.com/hyperliquid.png',
                    siteUrl: 'https://app.hyperliquid.xyz',
                    type: 'Perpetuals',
                    positionInUSD: 970.071627,
                    positions: [
                        {
                            id: 'hyperliquid-1',
                            assets: [
                                {
                                    name: 'USDC',
                                    symbol: 'USDC',
                                    decimals: 8,
                                    price: 1,
                                    amount: 970.071627,
                                    type: 4,
                                    value: 970.071627
                                },
                                {
                                    name: 'BTC',
                                    symbol: 'BTC',
                                    decimals: 8,
                                    price: 81626.5,
                                    amount: 0.4947,
                                    type: 5,
                                    value: 40382
                                }
                            ],
                            additionalData: {
                                positionInUSD: 970.071627,
                                collateralInUSD: 970.071627,
                                name: 'Perpetuals',
                                detailTypes: ['perpetuals'],
                                pool: 'Perpetuals',
                                description: 'Main-Account',
                                side: 'Short',
                                entryPrice: 81678,
                                markPrice: 81743,
                                liquidationPrice: 82670.4689661093,
                                leverage: 40,
                                pnlUsdValue: -32.1568,
                                marginRate: 0.025,
                                dailyFundingRate: 0
                            }
                        }
                    ]
                },
                {
                    providerName: 'Polymarket',
                    iconUrl: 'https://example.com/polymarket.png',
                    siteUrl: 'https://polymarket.com/',
                    type: 'Prediction',
                    positionInUSD: 93,
                    positions: [
                        {
                            id: 'polymarket-1',
                            assets: [
                                {
                                    name: 'Will it rain tomorrow?',
                                    symbol: 'Yes',
                                    decimals: 6,
                                    price: 0.62,
                                    amount: 150,
                                    type: 6,
                                    value: 93
                                }
                            ],
                            additionalData: {
                                positionInUSD: 93,
                                collateralInUSD: 93,
                                name: 'Prediction',
                                detailTypes: ['prediction'],
                                pool: 'Will it rain tomorrow?',
                                side: 'Yes',
                                predictionName: 'Will it rain tomorrow?',
                                predictionAmount: 150,
                                predictionPrice: 0.62,
                                eventEndAt: 1798761600,
                                isMarketClosed: false
                            }
                        }
                    ]
                }
            ],
            updatedAt: 0
        },
        otherNetworksDefiCounts: {}
    }) as unknown as ExternalPortfolioDiscoveryResponse
const expectedAppPositions: PortfolioDefiPosition[] = [
    {
        providerName: 'Hyperliquid',
        providerUrl: 'https://app.hyperliquid.xyz',
        providerIconUrl: 'https://example.com/hyperliquid.png',
        name: 'Perpetuals',
        description: 'Main-Account',
        balanceUSD: 970.071627,
        collateralUSD: 970.071627,
        perpetual: {
            side: 'Short',
            entryPrice: 81678,
            markPrice: 81743,
            liquidationPrice: 82670.4689661093,
            leverage: 40,
            pnlUSD: -32.1568,
            marginRate: 0.025,
            dailyFundingRate: 0
        },
        assets: [
            {
                balanceRaw: '97007162700',
                balance: 970.071627,
                balanceUSD: 970.071627,
                symbol: 'USDC',
                decimals: 8,
                priceUSD: 1,
                type: 'margin'
            },
            {
                balanceRaw: '49470000',
                balance: 0.4947,
                balanceUSD: 40382,
                symbol: 'BTC',
                decimals: 8,
                priceUSD: 81626.5,
                type: 'perpetual'
            }
        ]
    },
    {
        providerName: 'Polymarket',
        providerUrl: 'https://polymarket.com/',
        providerIconUrl: 'https://example.com/polymarket.png',
        name: 'Prediction',
        balanceUSD: 93,
        collateralUSD: 93,
        prediction: {
            market: 'Will it rain tomorrow?',
            side: 'Yes',
            eventEndAt: 1798761600,
            isMarketClosed: false
        },
        assets: [
            {
                balanceRaw: '150000000',
                balance: 150,
                balanceUSD: 93,
                symbol: 'Yes',
                decimals: 6,
                priceUSD: 0.62,
                type: 'prediction'
            }
        ]
    }
]
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
const getRequestedUrl = () => new URL(mockedFetch.mock.calls[0][0])

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
        expect(url.searchParams.get('defi')).toEqual('cache')
    })

    test('should request the given DeFi mode from Velcro', async () => {
        await getPortfolioDiscovery(TEST_WALLET, commonNetworks, undefined, { defiMode: 'force' })

        expect(getRequestedUrl().searchParams.get('defi')).toEqual('force')
    })

    test('should wait longer for Velcro when DeFi positions may be refetched', async () => {
        jest.useFakeTimers()
        try {
            mockedFetch.mockImplementation(() => new Promise(() => {}))
            const withCache = getPortfolioDiscovery(TEST_WALLET).catch((e) => e.message)
            const withDefi = getPortfolioDiscovery(TEST_WALLET, commonNetworks, undefined, {
                defiMode: 'default'
            }).catch((e) => e.message)
            let isDefiSettled = false
            withDefi.then(() => (isDefiSettled = true))

            await jest.advanceTimersByTimeAsync(6000)
            expect(await withCache).toEqual('Velcro discovery timed out')
            expect(isDefiSettled).toBe(false)

            await jest.advanceTimersByTimeAsync(24000)
            expect(await withDefi).toEqual('Velcro discovery timed out')
        } finally {
            jest.useRealTimers()
        }
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
        expect(res[0]).not.toHaveProperty('defiPositions')
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

    test('should get portfolio with the DeFi positions from the same Velcro request', async () => {
        mockedFetch.mockImplementation(() =>
            mockFetchResponse([{ ...mockedDiscovery, defi: velcroDefi() }])
        )
        const res = await getPortfolioWithDefiVelcroV3(TEST_WALLET)

        expect(mockedFetch).toHaveBeenCalledTimes(1)
        expect(getRequestedUrl().searchParams.get('defi')).toEqual('default')
        expect(getRequestedUrl().searchParams.get('networks')).toEqual('1')
        expect(mockPortfolioGet.mock.calls[0][1].additionalErc20Hints).toEqual([USDC_ADDRESS])

        expect(res).not.toHaveProperty('appPositions')
        expect(res.portfolio).toHaveLength(1)
        expect(res.portfolio[0].network.name).toEqual('Ethereum')
        expect(res.portfolio[0].tokens).toHaveLength(1)
        expect(res.portfolio[0].tokens[0].symbol).toEqual('USDC')
        expect(res.portfolio[0].defiPositions).toEqual(expectedDefiPositions)
    })

    test('should include networks with DeFi positions but no tokens', async () => {
        mockPortfolioGet.mockReturnValue(Promise.resolve({ tokens: [] }))
        mockedFetch.mockImplementation(() =>
            mockFetchResponse([{ ...mockedDiscovery, defi: velcroDefi() }])
        )
        const { portfolio } = await getPortfolioWithDefiVelcroV3(TEST_WALLET)

        expect(portfolio).toHaveLength(1)
        expect(portfolio[0].tokens).toHaveLength(0)
        expect(portfolio[0].defiPositions).toEqual(expectedDefiPositions)
    })

    test('should leave out networks with neither tokens nor DeFi positions', async () => {
        mockPortfolioGet.mockReturnValue(Promise.resolve({ tokens: [] }))
        const { portfolio } = await getPortfolioWithDefiVelcroV3(TEST_WALLET)

        expect(portfolio).toHaveLength(0)
    })

    test('should return no DeFi positions, not null, when Velcro sends an empty object', async () => {
        mockedFetch.mockImplementation(() => mockFetchResponse([{ ...mockedDiscovery, defi: {} }]))
        const { portfolio } = await getPortfolioWithDefiVelcroV3(TEST_WALLET)

        expect(portfolio[0].defiPositions).toEqual([])
    })

    test('should get the app positions from the same Velcro request when requested', async () => {
        mockedFetch.mockImplementation(() =>
            mockFetchResponse([{ ...mockedDiscovery, defi: velcroDefi() }, velcroApps()])
        )
        const res = await getPortfolioWithDefiVelcroV3(TEST_WALLET, commonNetworks, undefined, {
            includeAppPositions: true
        })

        expect(mockedFetch).toHaveBeenCalledTimes(1)
        expect(getRequestedUrl().searchParams.get('networks')).toEqual('1,customAppChain')
        // The apps entry has no token hints, so no balances are read for it
        expect(mockPortfolioGet).toHaveBeenCalledTimes(1)

        expect(res.portfolio).toHaveLength(1)
        expect(res.portfolio[0].defiPositions).toEqual(expectedDefiPositions)
        expect(res.appPositions).toEqual(expectedAppPositions)
    })

    test('should keep app positions with amounts in exponent notation', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
        const apps = velcroApps()
        const asset = (symbol: string, amount: number, decimals: number) => ({
            name: symbol,
            symbol,
            decimals,
            price: 1,
            amount,
            type: 1,
            value: amount
        })
        // As in a live Hyperliquid deposit, which ambire-common alone drops
        Object.assign(apps.defi, {
            positions: [
                {
                    providerName: 'Hyperliquid',
                    iconUrl: 'https://example.com/hyperliquid.png',
                    siteUrl: 'https://app.hyperliquid.xyz',
                    type: 'Deposit',
                    positions: [
                        {
                            id: 'hyperliquid-2',
                            assets: [
                                asset('USDC', 5.3e-7, 8),
                                asset('MAX', 1.5e21, 6),
                                asset('HYPE', 0.01433447, 8)
                            ],
                            additionalData: { name: 'Deposit', positionInUSD: 1.5e21 }
                        }
                    ]
                }
            ]
        })
        mockedFetch.mockImplementation(() => mockFetchResponse([mockedDiscovery, apps]))

        const { appPositions } = await getPortfolioWithDefiVelcroV3(
            TEST_WALLET,
            commonNetworks,
            undefined,
            { includeAppPositions: true }
        )

        expect(consoleError).not.toHaveBeenCalled()
        expect(appPositions).toHaveLength(1)
        expect(
            appPositions![0].assets.map(({ symbol, balanceRaw, balance }) => ({
                symbol,
                balanceRaw,
                balance
            }))
        ).toEqual([
            { symbol: 'USDC', balanceRaw: '53', balance: 5.3e-7 },
            { symbol: 'MAX', balanceRaw: '1500000000000000000000000000', balance: 1.5e21 },
            { symbol: 'HYPE', balanceRaw: '1433447', balance: 0.01433447 }
        ])

        consoleError.mockRestore()
    })

    test('should set app positions to null when Velcro does not return them', async () => {
        const res = await getPortfolioWithDefiVelcroV3(TEST_WALLET, commonNetworks, undefined, {
            includeAppPositions: true
        })

        expect(res).toHaveProperty('appPositions')
        expect(res.appPositions).toBeNull()
        expect(res.portfolio).toHaveLength(1)
    })

    test('should set app positions to null when Velcro fails to get them', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
        mockedFetch.mockImplementation(() =>
            mockFetchResponse([
                mockedDiscovery,
                {
                    ...velcroApps(),
                    defi: {
                        success: false,
                        errorState: [{ message: 'DeBank is down', level: 'fatal' }]
                    }
                }
            ])
        )
        const res = await getPortfolioWithDefiVelcroV3(TEST_WALLET, commonNetworks, undefined, {
            includeAppPositions: true
        })

        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('apps: DeBank is down'))
        expect(res.appPositions).toBeNull()
        expect(res.portfolio[0].defiPositions).toEqual([])

        consoleError.mockRestore()
    })

    test('should keep the tokens and set DeFi positions to null when Velcro fails to get them', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
        mockedFetch.mockImplementation(() =>
            mockFetchResponse([
                {
                    ...mockedDiscovery,
                    defi: {
                        success: false,
                        errorState: [{ message: 'DeBank is down', level: 'fatal' }]
                    }
                }
            ])
        )
        const { portfolio } = await getPortfolioWithDefiVelcroV3(TEST_WALLET)

        expect(consoleError).toHaveBeenCalledWith(
            expect.stringContaining('network Ethereum: DeBank is down')
        )
        expect(mockPortfolioGet.mock.calls[0][1].additionalErc20Hints).toEqual([USDC_ADDRESS])
        expect(portfolio[0].tokens).toHaveLength(1)
        expect(portfolio[0].defiPositions).toBeNull()

        consoleError.mockRestore()
    })

    test('should keep the tokens and set DeFi and app positions to null when discovery fails', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
        mockedFetch.mockImplementation(() => Promise.reject(new Error('Network down')))
        const res = await getPortfolioWithDefiVelcroV3(TEST_WALLET, commonNetworks, undefined, {
            includeAppPositions: true
        })

        expect(res.portfolio[0].tokens).toHaveLength(1)
        expect(res.portfolio[0].defiPositions).toBeNull()
        expect(res.appPositions).toBeNull()

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
