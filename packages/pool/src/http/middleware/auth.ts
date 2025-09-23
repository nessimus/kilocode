import type { NextFunction, Request, Response } from "express"

declare module "express-serve-static-core" {
	interface Request {
		accountId?: string
		userId?: string
	}
}

const ACCOUNT_HEADER = "x-account-id"
const USER_HEADER = "x-user-id"

export function requireTenant(req: Request, res: Response, next: NextFunction) {
	const accountId = req.header(ACCOUNT_HEADER)
	const userId = req.header(USER_HEADER)

	if (!accountId || !userId) {
		res.status(400).json({
			error: "missing_tenant_context",
			message: "Both x-account-id and x-user-id headers are required.",
		})
		return
	}

	req.accountId = accountId
	req.userId = userId
	next()
}
