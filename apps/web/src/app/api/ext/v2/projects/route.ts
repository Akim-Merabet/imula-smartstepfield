import { createProject, listProjects } from "@/features/api-access/rest/resources/projects";

export const GET = listProjects;
export const POST = createProject;
