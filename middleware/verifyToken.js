
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

let JWKS;

export const verifyToken = async (req, res, next) => {
  try {
    const AUTH_URL = (
      process.env.BETTER_AUTH_URL || process.env.CLIENT_URL
    )?.replace(/\/+$/, "");

    if (!AUTH_URL) {
      console.error("BETTER_AUTH_URL and CLIENT_URL are missing!");

      return res.status(500).json({
        success: false,
        message: "Authentication configuration is missing",
      });
    }

    if (!JWKS) {
      JWKS = createRemoteJWKSet(
        new URL(`${AUTH_URL}/api/auth/jwks`)
      );
    }

    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
      });
    }

    const token = authHeader.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_URL,
      audience: AUTH_URL,
    });

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    };

    next();
  } catch (error) {
    console.error("JWT Error:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};
