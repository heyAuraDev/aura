import { z } from 'zod';
export declare const ActionZodSchema: z.ZodObject<{
    tokens: z.ZodString;
    description: z.ZodString;
    platforms: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        url: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        url: string;
    }, {
        name: string;
        url: string;
    }>, "many">;
    networks: z.ZodArray<z.ZodString, "many">;
    operations: z.ZodArray<z.ZodEnum<["staking", "lending", "borrowing", "liquidity provision", "yield farming", "governance farming", "bridging", "holding", "swapping"]>, "many">;
    apy: z.ZodString;
    flags: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    flags: string[];
    tokens: string;
    description: string;
    platforms: {
        name: string;
        url: string;
    }[];
    networks: string[];
    operations: ("lending" | "staking" | "borrowing" | "liquidity provision" | "yield farming" | "governance farming" | "bridging" | "holding" | "swapping")[];
    apy: string;
}, {
    flags: string[];
    tokens: string;
    description: string;
    platforms: {
        name: string;
        url: string;
    }[];
    networks: string[];
    operations: ("lending" | "staking" | "borrowing" | "liquidity provision" | "yield farming" | "governance farming" | "bridging" | "holding" | "swapping")[];
    apy: string;
}>;
export declare const StrategyZodSchema: z.ZodObject<{
    name: z.ZodString;
    risk: z.ZodEnum<["low", "moderate", "high", "opportunistic"]>;
    actions: z.ZodArray<z.ZodObject<{
        tokens: z.ZodString;
        description: z.ZodString;
        platforms: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            url: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            url: string;
        }, {
            name: string;
            url: string;
        }>, "many">;
        networks: z.ZodArray<z.ZodString, "many">;
        operations: z.ZodArray<z.ZodEnum<["staking", "lending", "borrowing", "liquidity provision", "yield farming", "governance farming", "bridging", "holding", "swapping"]>, "many">;
        apy: z.ZodString;
        flags: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        flags: string[];
        tokens: string;
        description: string;
        platforms: {
            name: string;
            url: string;
        }[];
        networks: string[];
        operations: ("lending" | "staking" | "borrowing" | "liquidity provision" | "yield farming" | "governance farming" | "bridging" | "holding" | "swapping")[];
        apy: string;
    }, {
        flags: string[];
        tokens: string;
        description: string;
        platforms: {
            name: string;
            url: string;
        }[];
        networks: string[];
        operations: ("lending" | "staking" | "borrowing" | "liquidity provision" | "yield farming" | "governance farming" | "bridging" | "holding" | "swapping")[];
        apy: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    risk: "low" | "moderate" | "high" | "opportunistic";
    actions: {
        flags: string[];
        tokens: string;
        description: string;
        platforms: {
            name: string;
            url: string;
        }[];
        networks: string[];
        operations: ("lending" | "staking" | "borrowing" | "liquidity provision" | "yield farming" | "governance farming" | "bridging" | "holding" | "swapping")[];
        apy: string;
    }[];
}, {
    name: string;
    risk: "low" | "moderate" | "high" | "opportunistic";
    actions: {
        flags: string[];
        tokens: string;
        description: string;
        platforms: {
            name: string;
            url: string;
        }[];
        networks: string[];
        operations: ("lending" | "staking" | "borrowing" | "liquidity provision" | "yield farming" | "governance farming" | "bridging" | "holding" | "swapping")[];
        apy: string;
    }[];
}>;
export declare const StrategiesZodSchema: z.ZodObject<{
    strategies: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        risk: z.ZodEnum<["low", "moderate", "high", "opportunistic"]>;
        actions: z.ZodArray<z.ZodObject<{
            tokens: z.ZodString;
            description: z.ZodString;
            platforms: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                url: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                url: string;
            }, {
                name: string;
                url: string;
            }>, "many">;
            networks: z.ZodArray<z.ZodString, "many">;
            operations: z.ZodArray<z.ZodEnum<["staking", "lending", "borrowing", "liquidity provision", "yield farming", "governance farming", "bridging", "holding", "swapping"]>, "many">;
            apy: z.ZodString;
            flags: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            flags: string[];
            tokens: string;
            description: string;
            platforms: {
                name: string;
                url: string;
            }[];
            networks: string[];
            operations: ("lending" | "staking" | "borrowing" | "liquidity provision" | "yield farming" | "governance farming" | "bridging" | "holding" | "swapping")[];
            apy: string;
        }, {
            flags: string[];
            tokens: string;
            description: string;
            platforms: {
                name: string;
                url: string;
            }[];
            networks: string[];
            operations: ("lending" | "staking" | "borrowing" | "liquidity provision" | "yield farming" | "governance farming" | "bridging" | "holding" | "swapping")[];
            apy: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        name: string;
        risk: "low" | "moderate" | "high" | "opportunistic";
        actions: {
            flags: string[];
            tokens: string;
            description: string;
            platforms: {
                name: string;
                url: string;
            }[];
            networks: string[];
            operations: ("lending" | "staking" | "borrowing" | "liquidity provision" | "yield farming" | "governance farming" | "bridging" | "holding" | "swapping")[];
            apy: string;
        }[];
    }, {
        name: string;
        risk: "low" | "moderate" | "high" | "opportunistic";
        actions: {
            flags: string[];
            tokens: string;
            description: string;
            platforms: {
                name: string;
                url: string;
            }[];
            networks: string[];
            operations: ("lending" | "staking" | "borrowing" | "liquidity provision" | "yield farming" | "governance farming" | "bridging" | "holding" | "swapping")[];
            apy: string;
        }[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    strategies: {
        name: string;
        risk: "low" | "moderate" | "high" | "opportunistic";
        actions: {
            flags: string[];
            tokens: string;
            description: string;
            platforms: {
                name: string;
                url: string;
            }[];
            networks: string[];
            operations: ("lending" | "staking" | "borrowing" | "liquidity provision" | "yield farming" | "governance farming" | "bridging" | "holding" | "swapping")[];
            apy: string;
        }[];
    }[];
}, {
    strategies: {
        name: string;
        risk: "low" | "moderate" | "high" | "opportunistic";
        actions: {
            flags: string[];
            tokens: string;
            description: string;
            platforms: {
                name: string;
                url: string;
            }[];
            networks: string[];
            operations: ("lending" | "staking" | "borrowing" | "liquidity provision" | "yield farming" | "governance farming" | "bridging" | "holding" | "swapping")[];
            apy: string;
        }[];
    }[];
}>;
//# sourceMappingURL=zod.d.ts.map