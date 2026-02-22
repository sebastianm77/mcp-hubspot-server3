import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { handleAccessRequest } from "./access-handler";
import type { Props } from "./workers-oauth-utils";

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
	    name: "HubSpot-MCP",
	    version: "2.0.5",
	    description: "An extensive MCP for the HubSpot API"
	});

	private formatResponse(data: any) {
	  let text = '';
	
	  if (typeof data === 'string') {
	    text = data
	  } else if (data === null || data === undefined) {
	    text = "No data returned"
	  } else if (typeof data === 'object') {
	    text = JSON.stringify(data)
	  } else {
	    text = String(data)
	  }
	
	  return { content: [{ type: "text", text }] }
	}
	
	private async makeApiRequest(apiKey: string, endpoint: string, params: Record<string, any> = {}, method = 'GET', body: Record<string, any> | null = null) {
	  if (!apiKey) {
	    throw new Error("HUBSPOT_ACCESS_TOKEN environment variable is not set")
	  }
	
	  const queryParams = new URLSearchParams()
	  Object.entries(params).forEach(([key, value]) => {
	    if (value !== undefined) queryParams.append(key, value.toString())
	  })
	
	  const url = `https://api.hubapi.com${endpoint}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
	
	  const headers: Record<string, string> = {
	    'Accept': 'application/json',
	    'Authorization': `Bearer ${apiKey}`
	  }
	
	  if (body) headers['Content-Type'] = 'application/json'
	
	  const requestOptions: RequestInit = { method, headers }
	
	  if (body) requestOptions.body = JSON.stringify(body)
	
	  const response = await fetch(url, requestOptions)
	
	  if (!response.ok) return `Error fetching data from HubSpot: Status ${response.status}`
	
	  if (response.status === 204) return `No data returned: Status ${response.status}`
	
	  return await response.json()
	}
	
	private async makeApiRequestWithErrorHandling(apiKey: string, endpoint: string, params: Record<string, any> = {}, method = 'GET', body: Record<string, any> | null = null) {
	  try {
	    const data = await this.makeApiRequest(apiKey, endpoint, params, method, body)
	    return this.formatResponse(data)
	  } catch (error: any) {
	    return this.formatResponse(`Error performing request: ${error.message}`)
	  }
	}
	
	private async handleEndpoint(apiCall: () => Promise<any>) {
	  try {
	    return await apiCall()
	  } catch (error: any) {
	    return this.formatResponse(error.message)
	  }
	}
	
	private getConfig(config: any) {
	  return {
	    hubspotAccessToken: config?.HUBSPOT_ACCESS_TOKEN ?? (this as any).env?.HUBSPOT_ACCESS_TOKEN
	  }
	}
	

	

	async init() {
		// Hello, world!
		this.server.tool(
			"add",
			"Add two numbers the way only MCP can",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ text: String(a + b), type: "text" }],
			}),
		);

		const { hubspotAccessToken } = this.getConfig((this as any).props);

		// Companies: https://developers.hubspot.com/docs/reference/api/crm/objects/companies
		const companyPropertiesSchema = z
			.object({
				name: z.string().optional(),
				domain: z.string().optional(),
				website: z.string().url().optional(),
				description: z.string().optional(),
				industry: z.string().optional(),
				numberofemployees: z.number().optional(),
				annualrevenue: z.number().optional(),
				city: z.string().optional(),
				state: z.string().optional(),
				country: z.string().optional(),
				phone: z.string().optional(),
				address: z.string().optional(),
				address2: z.string().optional(),
				zip: z.string().optional(),
				type: z.string().optional(),
				lifecyclestage: z
					.enum(["lead", "customer", "opportunity", "subscriber", "other"])
					.optional(),
			})
			.catchall(z.any());

		this.server.tool(
			"crm_create_company",
			"Create a new company with validated properties",
			{
				properties: companyPropertiesSchema,
				associations: z
					.array(
						z.object({
							to: z.object({ id: z.string() }),
							types: z.array(
								z.object({
									associationCategory: z.string(),
									associationTypeId: z.number(),
								}),
							),
						}),
					)
					.optional(),
			},
			async (params) => {
				return this.handleEndpoint(async () => {
					const endpoint = "/crm/v3/objects/companies";
					return await this.makeApiRequestWithErrorHandling(hubspotAccessToken, endpoint, {}, "POST", {
						properties: params.properties,
						associations: params.associations,
					});
				});
			},
		);

		this.server.tool(
			"crm_update_company",
			"Update an existing company with validated properties",
			{
				companyId: z.string(),
				properties: companyPropertiesSchema,
			},
			async (params) => {
				return this.handleEndpoint(async () => {
					const endpoint = `/crm/v3/objects/companies/${params.companyId}`;
					return await this.makeApiRequestWithErrorHandling(hubspotAccessToken, endpoint, {}, "PATCH", {
						properties: params.properties,
					});
				});
			},
		);

		this.server.tool(
			"crm_get_company",
			"Get a single company by ID with specific properties and associations",
			{
				companyId: z.string(),
				properties: z.array(z.string()).optional(),
				associations: z.array(z.enum(["contacts", "deals", "tickets"])).optional(),
			},
			async (params) => {
				return this.handleEndpoint(async () => {
					const endpoint = `/crm/v3/objects/companies/${params.companyId}`;
					return await this.makeApiRequestWithErrorHandling(hubspotAccessToken, endpoint, {
						properties: params.properties?.join(","),
						associations: params.associations?.join(","),
					});
				});
			},
		);

		this.server.tool(
			"crm_search_companies",
			"Search companies with company-specific filters",
			{
				filterGroups: z.array(
					z.object({
						filters: z.array(
							z.object({
								propertyName: z.string(),
								operator: z.enum([
									"EQ",
									"NEQ",
									"LT",
									"LTE",
									"GT",
									"GTE",
									"BETWEEN",
									"IN",
									"NOT_IN",
									"HAS_PROPERTY",
									"NOT_HAS_PROPERTY",
									"CONTAINS_TOKEN",
									"NOT_CONTAINS_TOKEN",
								]),
								value: z.any(),
							}),
						),
					}),
				),
				properties: z.array(z.string()).optional(),
				limit: z.number().min(1).max(100).optional(),
				after: z.string().optional(),
				sorts: z
					.array(
						z.object({
							propertyName: z.string(),
							direction: z.enum(["ASCENDING", "DESCENDING"]),
						}),
					)
					.optional(),
			},
			async (params) => {
				return this.handleEndpoint(async () => {
					const endpoint = "/crm/v3/objects/companies/search";
					return await this.makeApiRequestWithErrorHandling(hubspotAccessToken, endpoint, {}, "POST", {
						filterGroups: params.filterGroups,
						properties: params.properties,
						limit: params.limit,
						after: params.after,
						sorts: params.sorts,
					});
				});
			},
		);
	}
}

export default new OAuthProvider({
	apiHandler: MyMCP.serve("/mcp"),
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: { fetch: handleAccessRequest as any },
	tokenEndpoint: "/token",
});
