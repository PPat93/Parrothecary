import {defineConfig, devices} from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({path: path.resolve(process.cwd(), '.env.local')});


const browsers = [
    {name: 'Chrome', device: devices['Desktop Chrome']},
    {name: 'Firefox', device: devices['Desktop Firefox']}
// {name: 'Safari', device:    devices['Desktop Safari']}
]

const tests = [
    {
        name: 'Smokes',
        command: 'npm run start',
        use: {baseURL: 'http://localhost:3000'},
        testMatch: /.*\.smoke\.spec\.ts$/
    },
    {
        name: 'Functional',
        command: 'npm run start',
        use: {baseURL: 'http://localhost:3001'},
        testMatch: /.*\.func\.spec\.ts$/
    }
]

const deps = {
    auth: {
        name: 'setup',
        testMatch: /auth\.setup\.ts/
    }
}

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
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('')`. */
        baseURL: process.env.LOCAL_URL || 'http://localhost:3000',
        testIdAttribute: 'test-data',
        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
    },


    /* Configure projects for major browsers */
    projects: tests.flatMap(testType =>
        browsers.map(browser => ({
            name: `${testType.name} ${browser.name}`,
            use: [

            ]
        }))

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
],

/* Run your local dev server before starting the tests */
webServer: [
    {
        command: 'npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        env: {DATABASE_PATH: process.env.DATABASE_PATH_SMOKES ?? './data/parrothecary.db'}
    },
    {
        command: 'npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        env: {DATABASE_PATH: process.env.DATABASE_PATH_FUNC ?? './data/parrothecary.db'}
    }]
    ,
})
;
