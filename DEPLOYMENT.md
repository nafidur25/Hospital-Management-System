# Deployment Notes

## Recommended hosting

The managed hosting attached to this project is the supported deployment path. It already supplies the database connection, authenticated application environment, storage integration, session configuration, custom-domain controls, and the production build/runtime contract used by this HMS.

## Vercel feasibility

**Yes, the project now includes a Vercel deployment configuration.** The `build:vercel` script produces the Vite frontend at `dist/public`; `api/index.ts` exports the Express/tRPC application as a Vercel Function; and `vercel.json` routes API traffic to that function while Vercel serves the frontend. This avoids relying on Express static middleware, which Vercel documents as ignored in its Express deployment model.[1]

| Area | Required external-deployment work |
|---|---|
| Runtime | `api/index.ts` is the Vercel-recognized Express Function entrypoint. The existing `listen()` startup wrapper remains for the managed/local runtime. |
| Frontend assets | `pnpm build:vercel` builds Vite into `dist/public`, which is configured as Vercel’s static output directory. |
| Database | Use an externally reachable MySQL/TiDB database and set `DATABASE_URL` for Preview and Production. |
| Sessions | Provide a new, strong `JWT_SECRET`; verify secure cookie, CORS, and callback-domain behavior for the Vercel domain and any custom domain. |
| Authentication | Replace or independently configure the managed OAuth runtime values, update permitted callback URLs, and keep the credential login path server-side. |
| Storage and integrations | Replace the managed Forge/storage environment values with an external S3-compatible storage provider or another supported service. |

Configure external secrets in the Vercel project settings rather than committing any `.env` file. Vercel applies variables to new deployments, and supports distinct values for Development, Preview, and Production.[2]

> Do not copy the managed platform's injected credentials into Vercel. Create separate secrets and service credentials for the external deployment.

## Deploying on Vercel

Connect the source repository in Vercel, retain the project’s `vercel.json`, and use the automatically detected `pnpm build:vercel` command. Before the first deployment, configure `DATABASE_URL`, `JWT_SECRET`, the OAuth configuration required by the selected identity provider, and external storage credentials. The managed Forge/OAuth environment variables supplied in this workspace are not transferable to Vercel.

After the Vercel deployment URL is known, register that URL and any custom-domain URL as permitted OAuth callback/redirect destinations. Confirm credential login, OAuth login, patient archival/restoration, database connectivity, and storage access in a Preview deployment before promoting it to Production.

## Practical recommendation

Use the built-in Publish control for the managed demonstration workflow. Use the included Vercel configuration when you need Git-driven Preview deployments or an existing Vercel domain workflow; its external services and OAuth callback settings remain your responsibility.

## References

[1]: https://vercel.com/docs/frameworks/backend/express "Vercel: Express on Vercel"
[2]: https://vercel.com/docs/environment-variables "Vercel: Environment variables"
