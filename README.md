Ivory Admin is a [Next.js](https://nextjs.org) operations panel for managing products, rates, tags, imports, and admin workflows.

The source is organized around clean architecture boundaries. Next.js routes live in `src/app`, while supporting code is separated into `application`, `domain`, `infrastructure`, `presentation`, `shared`, and `config` layers. See `src/ARCHITECTURE.md` for the folder map and dependency rules.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the admin app from `src/app`. Shared UI lives in `src/presentation/components`, business workflows live in `src/application/use-cases`, and external service adapters live in `src/infrastructure`.

Before changing behavior, run:

```bash
npm run lint
npm run build
```

## Environment variables

Required values are loaded from `.env.local` (gitignored). Notable variables:

- `NEXT_PUBLIC_FIREBASE_*` – Firebase client SDK config used for browser-side auth.
- `FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_SERVICE_ACCOUNT_PATH` – Admin SDK credentials for server-side Firestore / Storage access.
- `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_SERVICE_ACCOUNT_PATH` – Google service account for Drive / Sheets access (product import, tag sync, quotation upload).
- `RATE_ENCRYPTION_KEY` – AES-256 key used to decrypt the `Rate` collection's `Rs_Rate` values.
- `DRIVE_FOLDER_ID` – Default Drive folder ID used by tag sync and bulk product import.
- `QUOTE_GENERATOR_URL` – HTTPS endpoint of the `generateQuoteInternal` Cloud Function in `IvoryRoseApp-functions`. Defaults to `https://us-central1-ivory-rose.cloudfunctions.net/generateQuoteInternal`.
- `QUOTE_INTERNAL_SECRET` – Shared secret used by the local-folder importer to authenticate against `generateQuoteInternal`. Must match the value set via `firebase functions:secrets:set QUOTE_INTERNAL_SECRET` in the functions project.

After a successful local-folder product import (`/admin/import`), the importer calls `generateQuoteInternal` for every product whose status is `CREATE` or `UPDATE`, then uploads the resulting `.xlsx` to `{productId}/Quotations/{productId}_quote.xlsx` inside the destination Shared Drive folder. Quotation generation failures are reported in the import summary as warnings and do not abort the import.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
