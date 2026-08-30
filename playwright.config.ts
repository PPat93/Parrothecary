import {defineConfig, devices} from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv';
import path from 'path';
import {EMPTY_AUTH_PATH, SEEDED_AUTH_PATH} from "./e2e/utils/shared/shared";

dotenv.config({path: path.resolve(process.cwd(), '.env.local')});

const urls = {
    empty: 'http://localhost:3000',
    seeded: 'http://localhost:3001'
}

const browsers = [
    {name: 'Chrome', device: 'Desktop Chrome'},
    // {name: 'Firefox', device: 'Desktop Firefox'}
    // {name: 'Safari', device:   'Desktop Safari'}
]

const tests = [
    {
        name: 'Smokes',
        command: 'npm run start',
        use: {baseURL: urls.empty},
        testMatch: /.*\.smoke\.spec\.ts$/,
        storageState: EMPTY_AUTH_PATH,
        dependencies: ['setup-empty']
    },
    {
        name: 'Functional',
        command: 'npm run start',
        use: {baseURL: urls.seeded},
        testMatch: /.*\.func\.spec\.ts$/,
        storageState: SEEDED_AUTH_PATH,
        dependencies: ['setup-seeded']
    }
]

// @ts-ignore
// @ts-ignore
// @ts-ignore
/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: './e2e',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    globalSetup: './e2e/utils/shared/global.db.prep',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('')`. */
        baseURL: process.env.LOCAL_URL || 'http://localhost:3000',
        testIdAttribute: 'test-data',
        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
    },


    /* Configure projects for major browsers */
    projects: [
        {
            name: 'setup-empty',
            testMatch: /empty\.auth\.setup\.ts/,
            use: {baseURL: urls.empty}
        },
        {
            name: 'setup-seeded',
            testMatch: /seeded\.auth\.setup\.ts/,
            use: {baseURL: urls.seeded},

        },
        // dynamic projects preparations for future namespacing
        ...tests.flatMap(testType =>
            browsers.map(browser => ({
                    name: `${testType.name} ${browser.name}`,
                    use: {
                        ...devices[`${browser.device}`],
                        storageState: testType.storageState,
                        baseURL: testType.use.baseURL
                    },
                    command: testType.command,
                    testMatch: testType.testMatch,
                    dependencies: testType.dependencies
                })
            )
        )
    ],

//
//         url: 'http://localhost:3000',
//         testMatch: /.*\.smoke\.spec\.ts$/,
//         env: {DATABASE_PATH: process.env.DATABASE_PATH_SMOKE ?? './data/parrothecary.db'},
//
// })


//
// [
//     {
//         name: 'Smoke',
//         use: {
//             ...devices['Desktop Chrome'],
//             storageState: 'e2e/.auth/auth.json'
//         },
//         dependencies: ['setup']
//     },
//
//
//     {
//         name: 'setup',
//         testMatch: /auth\.setup\.ts/,
//     }

// {
//     name: 'firefox',
//     use: {
//         ...devices['Desktop Firefox'],
//         storageState: 'e2e/.auth/auth.json'
//     },
//     dependencies: ['setup']
// },

// {
//     name: 'webkit',
//     use: {
//         ...devices['Desktop Safari'],
//         storageState: 'e2e/.auth/auth.json'
//     },
//     dependencies: ['setup']
// },


    /* Test against mobile viewports. */
// {
//   name: 'Mobile Chrome',
//   use: { ...devices['Pixel 5'] },
// },
// {
//   name: 'Mobile Safari',
//   use: { ...devices['iPhone 12'] },
// },

    /* Test against branded browsers. */
// {
//   name: 'Microsoft Edge',
//   use: { ...devices['Desktop Edge'], channel: 'msedge' },
// },
// {
//   name: 'Google Chrome',
//   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
// },


    /* Run your local dev server before starting the tests */
    webServer: [
        {
            command: 'npm run start',
            url: urls.empty,
            reuseExistingServer: !process.env.CI,
            env: {
                PORT: '3000',
                DATABASE_PATH: process.env.DATABASE_PATH_SMOKE ?? './.tmp/seeded.db'
            }
        },
        {
            command: 'npm run start',
            url: urls.seeded,
            reuseExistingServer: !process.env.CI,
            env: {
                PORT: '3001',
                DATABASE_PATH: process.env.DATABASE_PATH_FUNC ?? './.tmp/seeded.db'
            }
        }]
    ,
})
;
