import { TokenResult } from 'ambire-common/dist/src/libs/portfolio/interfaces';
export type PortfolioLibToken = Pick<TokenResult, 'symbol' | 'address' | 'chainId' | 'decimals' | 'amount' | 'priceIn' | 'marketDataIn'>;
export type NetworkPortfolioLibResponse = {
    tokens: PortfolioLibToken[];
    error?: string | null;
};
export type PortfolioToken = {
    address: string;
    balanceRaw: string;
    balance: number;
    balanceUSD: number;
    symbol: string;
    decimals: number;
    priceUSD: number;
    priceChange24h: number;
};
export type PortfolioNetworkInfo = {
    name: string;
    chainId: string;
    platformId: string;
    explorerUrl: string;
    iconUrls: string[];
};
export type PortfolioForNetwork = {
    network: PortfolioNetworkInfo;
    tokens: PortfolioToken[];
};
export type DefiMode = 'cache' | 'default' | 'force';
export type PortfolioDefiAssetType = 'liquidity' | 'collateral' | 'borrow' | 'reward' | 'margin' | 'perpetual' | 'prediction';
export type PortfolioDefiAsset = {
    address?: string;
    balanceRaw: string;
    balance: number;
    balanceUSD: number;
    symbol: string;
    decimals: number;
    priceUSD: number;
    type: PortfolioDefiAssetType;
};
export type PortfolioDefiPosition = {
    providerName: string;
    providerUrl: string;
    providerIconUrl: string;
    name?: string;
    description?: string;
    poolId?: string;
    healthRate?: number;
    balanceUSD: number;
    collateralUSD?: number;
    debtUSD?: number;
    perpetual?: {
        side: string;
        entryPrice: number;
        markPrice: number;
        liquidationPrice: number;
        leverage: number;
        pnlUSD: number;
        marginRate: number;
        dailyFundingRate: number;
    };
    prediction?: {
        market: string;
        side: string;
        eventEndAt?: number;
        isMarketClosed?: boolean;
    };
    assets: PortfolioDefiAsset[];
};
export type PortfolioWithDefiForNetwork = PortfolioForNetwork & {
    defiPositions: PortfolioDefiPosition[] | null;
};
export type PortfolioDiscoveryOptions = {
    defiMode?: DefiMode;
    includeAppPositions?: boolean;
};
export type PortfolioWithDefi = {
    portfolio: PortfolioWithDefiForNetwork[];
    appPositions?: PortfolioDefiPosition[] | null;
};
export declare enum StrategyRisk {
    LOW = "low",
    MODERATE = "moderate",
    HIGH = "high",
    OPPORTUNISTIC = "opportunistic"
}
export type StrategyAction = {
    tokens: string;
    description: string;
    platforms?: Array<{
        name: string;
        url: string;
    }>;
    networks?: string[];
    operations?: string[];
    apy?: string;
    flags?: string[];
};
export type Strategy = {
    name: string;
    risk: StrategyRisk;
    actions: StrategyAction[];
};
export type LlmProcessProps = {
    prompt: string;
    model?: string;
    llmOptionsOverride?: {
        [x: string]: any;
    };
    timeout?: number;
    timeoutMsg?: string;
};
export type LlmProcessOutput = {
    llm: {
        provider: string;
        model: string;
    };
    response: Strategy[] | null;
    inputTokens: number;
    outputTokens: number;
    error?: string | null;
};
export type ProcessAddressProps = {
    address: string;
    getPortfolio: (address: string) => Promise<PortfolioForNetwork[]>;
    makePrompt: (props: PromptProps) => Promise<string>;
    llmProcessor: (props: LlmProcessProps) => Promise<LlmProcessOutput>;
    model?: string;
    llmOptionsOverride?: any;
};
export type PromptProps = {
    portfolio: PortfolioForNetwork[];
};
export type AuraResponse_01 = {
    address: string;
    portfolio: PortfolioForNetwork[];
    strategies: LlmProcessOutput[];
};
//# sourceMappingURL=types.d.ts.map