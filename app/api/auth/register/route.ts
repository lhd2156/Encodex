// app/api/auth/register/route.ts
import { generateAndEncryptRecoveryKey, getUserSalt } from "@/lib/crypto";

const users: any[] = [];

export async function POST(req: Request) {
  const body = await req.json();

  console.log('Registering user:', body);
  console.log('Current users:', users);

  // Check if the user already exists
  const existingUser = users.find((u) => u.email === body.email);
  if (existingUser) {
    return Response.json({
      success: false,
      message: "User already exists. Please log in or use the forgot password option.",
    }, { status: 400 });
  }

  // Generate a unique recovery key
  const userPassword = body.password; // Assuming password is provided in the request body
  const userEmail = body.email; // Assuming email is provided in the request body
  const salt = getUserSalt(userEmail);
  const { encryptedKey, iv } = await generateAndEncryptRecoveryKey(userPassword, salt);

  // Store the encrypted recovery key and IV in the user data
  const userData = {
    ...body,
    recoveryKey: {
      encryptedKey: Array.from(new Uint8Array(encryptedKey)),
      iv: Array.from(iv),
    },
  };

  users.push(userData);

  console.log('User added:', userData);

  return Response.json({ success: true });
}
