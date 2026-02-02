// app/api/auth/register/route.ts
const users: any[] = [];

export async function POST(req: Request) {
  const body = await req.json();

  users.push(body);

  return Response.json({ success: true });
}
