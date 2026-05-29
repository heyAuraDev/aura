"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAddress = void 0;
exports.getPortfolioForNetwork = getPortfolioForNetwork;
exports.getPortfolioVelcroV3 = getPortfolioVelcroV3;
const tslib_1 = require("tslib");
const node_fetch_1 = tslib_1.__importDefault(require("node-fetch"));
const networks_1 = require("ambire-common/dist/src/consts/networks");
const getRpcProvider_1 = require("ambire-common/dist/src/services/provider/getRpcProvider");
const portfolio_1 = require("ambire-common/dist/src/libs/portfolio");
const mockedAI_1 = require("./llm/mockedAI");
const prompts_1 = require("./prompts");
const strategies_1 = require("./strategies");
const __1 = require("..");
async function getPortfolioForNetwork(address, network, customFetch) {
    const provider = (0, getRpcProvider_1.getRpcProvider)(network.rpcUrls, network.chainId, network.selectedRpcUrl);
    const portfolio = new portfolio_1.Portfolio(customFetch || node_fetch_1.default, provider, network, 'https://relayer.ambire.com/velcro-v3');
    return portfolio
        .get(address, { baseCurrency: 'usd' })
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
async function getPortfolioVelcroV3(address, networks = networks_1.networks, customFetch) {
    const output = [];
    const responses = await Promise.all(networks.map((network) => getPortfolioForNetwork(address, network, customFetch)));
    for (const resp of responses) {
        const tokens = resp.tokens
            .filter((t) => t.amount > 0n)
            .map((t) => {
            const balance = Number(t.amount) / Math.pow(10, t.decimals);
            const priceUSD = (t.priceIn.find((p) => p.baseCurrency === 'usd') || { price: 0 })
                .price;
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
        if (!tokens.length) {
            continue;
        }
        const matchedNetwork = networks.find((n) => n.chainId === resp.tokens[0].chainId);
        const networkInfo = {
            name: matchedNetwork.name,
            chainId: matchedNetwork.chainId.toString(),
            platformId: matchedNetwork.platformId,
            explorerUrl: matchedNetwork.explorerUrl || '',
            iconUrls: matchedNetwork.iconUrls || []
        };
        output.push({
            network: networkInfo,
            tokens
        });
    }
    return output;
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