"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAddress = void 0;
exports.getPortfolioDiscovery = getPortfolioDiscovery;
exports.getPortfolioForNetwork = getPortfolioForNetwork;
exports.getPortfolioVelcroV3 = getPortfolioVelcroV3;
exports.getPortfolioWithDefiVelcroV3 = getPortfolioWithDefiVelcroV3;
const tslib_1 = require("tslib");
const node_fetch_1 = tslib_1.__importDefault(require("node-fetch"));
const networks_1 = require("ambire-common/dist/src/consts/networks");
const getRpcProvider_1 = require("ambire-common/dist/src/services/provider/getRpcProvider");
const portfolio_1 = require("ambire-common/dist/src/libs/portfolio");
const helpers_1 = require("ambire-common/dist/src/libs/portfolio/helpers");
const defiPositions_1 = require("ambire-common/dist/src/libs/defiPositions/defiPositions");
const types_1 = require("ambire-common/dist/src/libs/defiPositions/types");
const mockedAI_1 = require("./llm/mockedAI");
const prompts_1 = require("./prompts");
const strategies_1 = require("./strategies");
const timing_1 = require("./timing");
const __1 = require("..");
const VELCRO_URL = 'https://relayer.ambire.com/velcro-v3';
const VELCRO_TIMEOUT_SECONDS = 6;
// Velcro may refetch the DeFi positions before it responds, and the token hints come in the same response
const VELCRO_DEFI_TIMEOUT_SECONDS = 30;
// Velcro's id for the apps without a network, e.g. Hyperliquid and Polymarket
const APPS_CHAIN_ID = 'customAppChain';
const DEFI_ASSET_TYPES = {
    [types_1.AssetType.Liquidity]: 'liquidity',
    [types_1.AssetType.Collateral]: 'collateral',
    [types_1.AssetType.Borrow]: 'borrow',
    [types_1.AssetType.Reward]: 'reward',
    [types_1.AssetType.Margin]: 'margin',
    [types_1.AssetType.Perpetual]: 'perpetual',
    [types_1.AssetType.Prediction]: 'prediction'
};
// One Velcro request for all networks. It returns the token and NFT addresses the account
// probably holds and some prices, but no balances - those are read on-chain by the Portfolio lib.
// It also returns the DeFi positions, as fresh as `defiMode` asks for
async function getPortfolioDiscovery(address, networks = networks_1.networks, customFetch, { defiMode = 'cache', includeAppPositions = false } = {}) {
    const fetchFn = customFetch || node_fetch_1.default;
    const chainIds = [
        ...networks.map((n) => n.chainId.toString()),
        ...(includeAppPositions ? [APPS_CHAIN_ID] : [])
    ].join(',');
    const url = `${VELCRO_URL}/portfolio?networks=${chainIds}&account=${address}&baseCurrency=usd&defi=${defiMode}`;
    const timeoutSeconds = defiMode === 'cache' ? VELCRO_TIMEOUT_SECONDS : VELCRO_DEFI_TIMEOUT_SECONDS;
    const request = fetchFn(url).then(async (response) => {
        const body = await response.json();
        if (!response.ok || !Array.isArray(body)) {
            throw new Error(body?.message || body?.error || `Velcro responded with ${response.status}`);
        }
        return body;
    });
    return (0, timing_1.timeoutPromise)(request, timeoutSeconds, 'Velcro discovery timed out');
}
async function getPortfolioForNetwork(address, network, customFetch, 
// Without it only the native token, gas tank fee tokens and pinned tokens are checked
discovery) {
    const provider = (0, getRpcProvider_1.getRpcProvider)(network.rpcUrls, network.chainId, network.selectedRpcUrl);
    const portfolio = new portfolio_1.Portfolio(customFetch || node_fetch_1.default, provider, network);
    const hints = discovery ? (0, helpers_1.formatExternalHintsAPIResponse)(discovery) : null;
    // Tokens priced here aren't requested from cena again
    const tokenDataCache = new Map();
    Object.entries(discovery?.prices || {}).forEach(([tokenAddress, priceData]) => {
        if (typeof priceData?.price !== 'number')
            return;
        tokenDataCache.set((0, helpers_1.getTokenDataCacheKey)(tokenAddress), [
            Date.now(),
            (0, helpers_1.convertApiTokenDataToTokenDataCache)(priceData)
        ]);
    });
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
        const error = (0, __1.stringifyError)(err);
        console.error(`Error fetching portfolio for network ${network.name}: ${error}`);
        return {
            tokens: [],
            error
        };
    });
}
function formatPortfolioTokens(tokens) {
    return tokens
        .filter((t) => t.amount > 0n)
        .map((t) => {
        const balance = Number(t.amount) / Math.pow(10, t.decimals);
        const priceUSD = (t.priceIn.find((p) => p.baseCurrency === 'usd') || { price: 0 }).price;
        const priceChange24h = (t.marketDataIn.find((p) => p.baseCurrency === 'usd') || { change24h: 0 })
            .change24h || 0;
        return {
            symbol: t.symbol,
            balanceRaw: t.amount.toString(),
            balance,
            balanceUSD: balance * priceUSD,
            address: t.address,
            decimals: t.decimals,
            priceUSD,
            priceChange24h
        };
    });
}
function getNetworkInfo(network) {
    return {
        name: network.name,
        chainId: network.chainId.toString(),
        platformId: network.platformId,
        explorerUrl: network.explorerUrl || '',
        iconUrls: network.iconUrls || []
    };
}
// ambire-common can't parse an app amount in exponent notation, e.g. 5.3e-7, and drops the
// whole position. A plain decimal works both with that bug and after it's fixed there
function toPlainDecimal(amount, decimals) {
    if (typeof amount !== 'number' || !String(amount).includes('e'))
        return amount;
    // Numbers this large are always whole, while toFixed would keep the exponent
    return Math.abs(amount) >= 1 ? BigInt(amount).toString() : amount.toFixed(decimals);
}
function formatDefiAsset(asset) {
    const balance = Number(asset.amount) / Math.pow(10, asset.decimals);
    // App assets have a top-level `price` instead of `priceIn`
    const appPrice = 'price' in asset && typeof asset.price === 'number' ? asset.price : 0;
    const priceUSD = asset.priceIn?.price || appPrice;
    return {
        address: asset.address,
        balanceRaw: asset.amount.toString(),
        balance,
        balanceUSD: asset.value ?? balance * priceUSD,
        symbol: asset.symbol,
        decimals: asset.decimals,
        priceUSD,
        type: DEFI_ASSET_TYPES[asset.type]
    };
}
function formatDefiPosition(provider, position) {
    const { additionalData } = position;
    const detailTypes = additionalData.detailTypes || [];
    // Velcro sends the debt as a negative `deptInUSD`
    const debt = additionalData.debtInUSD ?? additionalData.deptInUSD;
    return {
        providerName: provider.providerName,
        providerUrl: provider.siteUrl,
        providerIconUrl: provider.iconUrl,
        name: additionalData.name,
        description: additionalData.description,
        // For app positions `pool` is a name, not an object
        poolId: additionalData.pool?.id,
        healthRate: additionalData.healthRate ?? undefined,
        balanceUSD: additionalData.positionInUSD || 0,
        collateralUSD: additionalData.collateralInUSD,
        debtUSD: typeof debt === 'number' ? Math.abs(debt) : undefined,
        perpetual: detailTypes.includes('perpetuals')
            ? {
                side: additionalData.side,
                entryPrice: additionalData.entryPrice,
                markPrice: additionalData.markPrice,
                liquidationPrice: additionalData.liquidationPrice,
                leverage: additionalData.leverage,
                pnlUSD: additionalData.pnlUsdValue,
                marginRate: additionalData.marginRate,
                dailyFundingRate: additionalData.dailyFundingRate
            }
            : undefined,
        prediction: detailTypes.includes('prediction')
            ? {
                market: additionalData.predictionName,
                side: additionalData.side,
                eventEndAt: additionalData.eventEndAt,
                isMarketClosed: additionalData.isMarketClosed
            }
            : undefined,
        assets: position.assets.map(formatDefiAsset)
    };
}
// Velcro groups the positions by provider, here they are flattened to one entry per position
function formatDefiPositions(label, discovery) {
    if (!discovery)
        return null;
    const { defi } = discovery;
    if (!defi || 'errorState' in defi) {
        const error = defi?.errorState[0]?.message || 'Unknown error';
        console.error(`Error fetching DeFi positions for ${label}: ${error}`);
        return null;
    }
    // An account with no DeFi positions gets an empty object back, not an error
    const rawProviders = 'positions' in defi ? defi.positions || [] : [];
    // Network amounts are already whole numbers in the token's smallest unit
    rawProviders
        .filter((provider) => !provider.chainId)
        .flatMap((provider) => provider.positions.flatMap((position) => position.assets))
        .forEach((asset) => {
        // Velcro sends app amounts as decimal numbers, though the lib's type says bigint
        Object.assign(asset, { amount: toPlainDecimal(asset.amount, asset.decimals) });
    });
    const providers = (0, defiPositions_1.getFormattedApiPositions)(rawProviders);
    return providers.flatMap((provider) => provider.positions.map((position) => formatDefiPosition(provider, position)));
}
// One Velcro request for all networks, then the token balances of each network
async function getNetworkPortfolios(address, networks, customFetch, discoveryOptions) {
    // Without discovery fewer tokens are found, but the portfolio is still usable
    const discovery = await getPortfolioDiscovery(address, networks, customFetch, discoveryOptions).catch((err) => {
        console.error(`Error fetching portfolio discovery for ${address}: ${(0, __1.stringifyError)(err)}`);
        return [];
    });
    const networkPortfolios = await Promise.all(networks.map(async (network) => {
        // Velcro returns some chain ids as numbers and others as strings
        const networkDiscovery = discovery.find((entry) => String(entry.chainId) === network.chainId.toString());
        const { tokens } = await getPortfolioForNetwork(address, network, customFetch, networkDiscovery);
        return { network, discovery: networkDiscovery, tokens: formatPortfolioTokens(tokens) };
    }));
    return {
        networkPortfolios,
        appsDiscovery: discovery.find((entry) => entry.chainId === APPS_CHAIN_ID)
    };
}
async function getPortfolioVelcroV3(address, networks = networks_1.networks, customFetch) {
    // DeFi positions aren't used, so Velcro can return its cached ones instead of refreshing them
    const { networkPortfolios } = await getNetworkPortfolios(address, networks, customFetch, {
        defiMode: 'cache'
    });
    return networkPortfolios
        .filter(({ tokens }) => tokens.length > 0)
        .map(({ network, tokens }) => ({ network: getNetworkInfo(network), tokens }));
}
// The same as getPortfolioVelcroV3, plus the DeFi positions from the same Velcro request.
// Networks with DeFi positions but no tokens are included too
async function getPortfolioWithDefiVelcroV3(address, networks = networks_1.networks, customFetch, { defiMode = 'default', includeAppPositions = false } = {}) {
    const { networkPortfolios, appsDiscovery } = await getNetworkPortfolios(address, networks, customFetch, { defiMode, includeAppPositions });
    const portfolio = networkPortfolios
        .map(({ network, discovery, tokens }) => ({
        network: getNetworkInfo(network),
        tokens,
        defiPositions: formatDefiPositions(`network ${network.name}`, discovery)
    }))
        .filter(({ tokens, defiPositions }) => tokens.length > 0 || !!defiPositions?.length);
    if (!includeAppPositions)
        return { portfolio };
    return { portfolio, appPositions: formatDefiPositions('apps', appsDiscovery) };
}
const processAddress = async ({ address, getPortfolio, makePrompt, llmProcessor, model, llmOptionsOverride } = {
    address: '0x69bfD720Dd188B8BB04C4b4D24442D3c15576D10',
    getPortfolio: getPortfolioVelcroV3,
    makePrompt: prompts_1.simplePrompt,
    llmProcessor: mockedAI_1.llmMockProcess
}) => {
    const portfolio = await getPortfolio(address);
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
                    response: strategies_1.EMPTY_PORTFOLIO_STRATEGIES,
                    inputTokens: 0,
                    outputTokens: 0
                }
            ]
        };
    }
    const prompt = await makePrompt({ portfolio });
    const strategies = await llmProcessor({ prompt, model, llmOptionsOverride });
    return {
        address,
        portfolio,
        strategies: [strategies]
    };
};
exports.processAddress = processAddress;
//# sourceMappingURL=portfolio.js.map