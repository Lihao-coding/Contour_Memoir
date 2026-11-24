export const asset = (path: string) => new URL(path, new URL(import.meta.env.BASE_URL, location.href)).href;
