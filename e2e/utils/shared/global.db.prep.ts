import {execSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const smoke = process.env.DATABASE_PATH_SMOKE;
const functional = process.env.DATABASE_PATH_FUNC;

function guard(value: string | undefined): string {
    if (!value) throw new Error(`DB path value not set up`);
    if (!value.includes(`DBs`)) throw new Error(`DB from fixtures should be selected`);
    return value;
}

function run(command: string, dbPath: string) {
    execSync(command, {
        stdio: 'inherit',
        env: {...process.env, DATABASE_PATH: dbPath},
    })
}

export default async function globalSetup() {
    const smokeDb = guard(smoke);
    const functDb = guard(functional);
    const dbSuffixes = [`-wal`, `-shm`];

    for (const singleDB of [smokeDb, functDb]) {
        fs.mkdirSync(path.dirname(singleDB), {recursive: true});

        for (const suffix of dbSuffixes) {
            fs.rmSync(singleDB + suffix, {force: true});
        }
    }

    run(`npm run db:reset -- --force`, smokeDb);

    run(`npm run db:reset -- --force`, functDb);
    run(`npm run db:seed`, functDb);
}