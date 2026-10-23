import { createFlow, listFlows } from "@/features/api-access/rest/resources/flows";

export const GET = listFlows;
export const POST = createFlow;
