import { handlers } from "@/auth";

type AuthRouteContext = {
  params: Promise<{ nextauth: string[] }>;
};

type AuthRouteHandler = (
  request: Request,
  context: AuthRouteContext,
) => Response | Promise<Response>;

const authHandlers = handlers as unknown as {
  GET: AuthRouteHandler;
  POST: AuthRouteHandler;
};

export const GET = authHandlers.GET;
export const POST = authHandlers.POST;
