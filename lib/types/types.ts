import { TokenResult } from 'ambire-common/dist/src/libs/portfolio/interfaces'

export type PortfolioLibToken = Pick<
    TokenResult,
    'symbol' | 'address' | 'chainId' | 'decimals' | 'amount' | 'priceIn' | 'marketDataIn'
>
export type NetworkPortfolioLibResponse = {
    tokens: PortfolioLibToken[]
    error?: string | null
}

export type PortfolioToken = {
    address: string
    balanceRaw: string
    balance: number
    balanceUSD: number
    symbol: string
    decimals: number
    priceUSD: number
    priceChange24h: number
}

export type PortfolioNetworkInfo = {
    name: string
    chainId: string
    platformId: string
    explorerUrl: string
    iconUrls: string[]
}

export type PortfolioForNetwork = {
    network: PortfolioNetworkInfo
    tokens: PortfolioToken[]
}

// Velcro's DeFi update modes
// - cache: stored positions, however old
// - default: stored positions if fresh, otherwise refetched
// - force: refetched positions, with a per-account cooldown on Velcro's side
export type DefiMode = 'cache' | 'default' | 'force'

export type PortfolioDefiAssetType =
    | 'liquidity'
    | 'collateral'
    | 'borrow'
    | 'reward'
    | 'margin'
    | 'perpetual'
    | 'prediction'

export type PortfolioDefiAsset = {
    // Undefined only for app positions without a token, e.g. Polymarket
    address?: string
    // For app positions it comes from the decimal amount the app reports, not from the chain
    balanceRaw: string
    balance: number
    // For a perpetual asset it is the position's notional value
    balanceUSD: number
    symbol: string
    decimals: number
    priceUSD: number
    type: PortfolioDefiAssetType
}

export type PortfolioDefiPosition = {
    providerName: string
    providerUrl: string
    providerIconUrl: string
    // The kind of position, e.g. 'Lending', 'Liquidity Pool', 'Staked', 'Perpetuals'
    name?: string
    // e.g. 'Main-Account' for a Hyperliquid position
    description?: string
    poolId?: string
    healthRate?: number
    // Borrowed assets are subtracted
    balanceUSD: number
    collateralUSD?: number
    // A positive number
    debtUSD?: number
    // Only for perpetual positions, e.g. on Hyperliquid
    perpetual?: {
        // 'Long' or 'Short'
        side: string
        entryPrice: number
        markPrice: number
        liquidationPrice: number
        leverage: number
        pnlUSD: number
        marginRate: number
        dailyFundingRate: number
    }
    // Only for prediction market positions, e.g. on Polymarket
    prediction?: {
        market: string
        // e.g. 'Yes' or 'No'
        side: string
        eventEndAt?: number
        isMarketClosed?: boolean
    }
    assets: PortfolioDefiAsset[]
}

export type PortfolioWithDefiForNetwork = PortfolioForNetwork & {
    // null when the positions couldn't be fetched, which is different from having none
    defiPositions: PortfolioDefiPosition[] | null
}

export type PortfolioDiscoveryOptions = {
    defiMode?: DefiMode
    // Also request the positions in apps without a network, e.g. Hyperliquid and Polymarket
    includeAppPositions?: boolean
}

export type PortfolioWithDefi = {
    portfolio: PortfolioWithDefiForNetwork[]
    // Left out when not requested, null when they couldn't be fetched
    appPositions?: PortfolioDefiPosition[] | null
}

export enum StrategyRisk {
    LOW = 'low',
    MODERATE = 'moderate',
    HIGH = 'high',
    OPPORTUNISTIC = 'opportunistic'
}

export type StrategyAction = {
    tokens: string
    description: string
    platforms?: Array<{ name: string; url: string }>
    networks?: string[]
    operations?: string[]
    apy?: string
    flags?: string[]
}

export type Strategy = {
    name: string
    risk: StrategyRisk
    actions: StrategyAction[]
}

export type LlmProcessProps = {
    prompt: string
    model?: string
    llmOptionsOverride?: { [x: string]: any }
    timeout?: number
    timeoutMsg?: string
}

export type LlmProcessOutput = {
    llm: {
        provider: string
        model: string
    }
    response: Strategy[] | null
    inputTokens: number
    outputTokens: number
    error?: string | null
}

export type ProcessAddressProps = {
    address: string
    getPortfolio: (address: string) => Promise<PortfolioForNetwork[]>
    makePrompt: (props: PromptProps) => Promise<string>
    llmProcessor: (props: LlmProcessProps) => Promise<LlmProcessOutput>
    model?: string
    llmOptionsOverride?: any
}

export type PromptProps = {
    portfolio: PortfolioForNetwork[]
}

export type AuraResponse_01 = {
    address: string
    portfolio: PortfolioForNetwork[]
    strategies: LlmProcessOutput[]
}
