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

	function formatResponse(data: any) {
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
	
	async function makeApiRequest(apiKey: string, endpoint: string, params: Record<string, any> = {}, method = 'GET', body: Record<string, any> | null = null) {
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
	
	async function makeApiRequestWithErrorHandling(apiKey: string, endpoint: string, params: Record<string, any> = {}, method = 'GET', body: Record<string, any> | null = null) {
	  try {
	    const data = await makeApiRequest(apiKey, endpoint, params, method, body)
	    return formatResponse(data)
	  } catch (error: any) {
	    return formatResponse(`Error performing request: ${error.message}`)
	  }
	}
	
	async function handleEndpoint(apiCall: () => Promise<any>) {
	  try {
	    return await apiCall()
	  } catch (error: any) {
	    return formatResponse(error.message)
	  }
	}
	
	function getConfig(config: any) {
	  return {
	    hubspotAccessToken: config?.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN,
	    telemetryEnabled: config?.TELEMETRY_ENABLED || process.env.TELEMETRY_ENABLED || "true"
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
