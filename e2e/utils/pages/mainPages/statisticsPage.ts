import {Locator, Page} from "@playwright/test";

export const STATISTICS_PAGE_TEXTS = {
    title: 'Statistics',
    moneyTab: `Money`,
    usageTab: `Usage`,

    exportSection: `Export`,
    boxesCsvLink: `Boxes.csv`,
    boxesCsvDescription: `Every box ever entered, including used up and binned — quantities, expiry, lot, price.`,
    stockMovementsCsvLink: `Stock Movements.csv`,
    stockMovementsCsvDescription: `The whole ledger. The only one of these that cannot be reconstructed by looking in the cupboard.`,
    productsCsvLink: `Products.csv`,
    productsCsvDescription: `The catalogue: ingredients, symptom tags, barcodes, pack sizes. The part that took an evening to type.`,

    backupSection: `Backup`,
    downloadBackupZipLink: `Download a backup.zip`,
    downloadBackupZipDescription: `The whole cupboard and every box photograph, in one file, with a note inside on how to put it back. Worth doing before a trip, or after an evening of typing.`,

    lastThirtyDaysStats: `30 days`,
    lastNinetyDaysStats: `90 days`,
    lastYearStats: `12 months`,
    allTimeUsageStats: `All time`,

    pageUrl: `/stats/usage`
} as const;

export class StatisticsPage {

    readonly page: Page;
    readonly title: Locator;

    readonly tabSwitcher: Locator;
    readonly moneyTab: Locator;
    readonly exportSection: Locator;
    readonly boxesCsvLink: Locator;
    readonly boxesCsvDescription: Locator;
    readonly stockMovementsCsvLink: Locator;
    readonly stockMovementsCsvDescription: Locator;
    readonly productsCsvLink: Locator;
    readonly productsCsvDescription: Locator;
    readonly backupSection: Locator;
    readonly downloadBackupZipLink: Locator;
    readonly downloadBackupZipDescription: Locator;

    readonly usageTab: Locator;
    readonly lastThirtyDaysStats: Locator;
    readonly lastNinetyDaysStats: Locator;
    readonly lastYearStats: Locator;
    readonly allTimeUsageStats: Locator;

    constructor(page: Page) {
        this.page = page;
    }
}