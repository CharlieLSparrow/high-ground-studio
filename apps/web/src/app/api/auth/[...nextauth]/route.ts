import { NextRequest } from "next/server";
import { handlers } from "@/auth";

export const GET = async (req: NextRequest, props: { params: Promise<any> }) => {
  const params = await props.params;
  return (handlers.GET as any)(req, { params });
};

export const POST = async (req: NextRequest, props: { params: Promise<any> }) => {
  const params = await props.params;
  return (handlers.POST as any)(req, { params });
};