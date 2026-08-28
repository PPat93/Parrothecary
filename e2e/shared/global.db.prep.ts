const smoke = process.env.DATABASE_PATH_SMOKE;
const functional = process.env.DATABASE_PATH_FUNC;

export default function guard(name: string, value: string | undefined): string {
    if (!value) throw new Error(`DB path value not set up`);
    if (!value.includes(`DBs`)) throw new Error(`DB from fixtures should be selected`);
    return value;
}