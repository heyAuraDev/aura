import { Network } from 'ambire-common/dist/src/interfaces/network';
import { Fetch } from 'ambire-common/dist/src/interfaces/fetch';
import { ExternalPortfolioDiscoveryResponse } from 'ambire-common/dist/src/libs/portfolio/interfaces';
import { PortfolioForNetwork, ProcessAddressProps, AuraResponse_01, NetworkPortfolioLibResponse, PortfolioDiscoveryOptions, PortfolioWithDefi } from '../types';
export declare function getPortfolioDiscovery(address: string, networks?: Network[], customFetch?: Fetch, { defiMode, includeAppPositions }?: PortfolioDiscoveryOptions): Promise<ExternalPortfolioDiscoveryResponse[]>;
export declare function getPortfolioForNetwork(address: string, network: Network, customFetch?: Fetch, discovery?: ExternalPortfolioDiscoveryResponse): Promise<NetworkPortfolioLibResponse>;
export declare function getPortfolioVelcroV3(address: string, networks?: Network[], customFetch?: Fetch): Promise<PortfolioForNetwork[]>;
export declare function getPortfolioWithDefiVelcroV3(address: string, networks?: Network[], customFetch?: Fetch, { defiMode, includeAppPositions }?: PortfolioDiscoveryOptions): Promise<PortfolioWithDefi>;
export declare const processAddress: ({ address, getPortfolio, makePrompt, llmProcessor, model, llmOptionsOverride }?: ProcessAddressProps) => Promise<AuraResponse_01>;
//# sourceMappingURL=portfolio.d.ts.map