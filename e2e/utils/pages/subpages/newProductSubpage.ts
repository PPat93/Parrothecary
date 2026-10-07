import {Locator, Page} from "@playwright/test";

export const NEW_PRODUCT_TEXTS = {

    // Main items
    title: `New product`,
    cancelBtn: `Cancel`,
    saveProductBtn: `Save product`,

    nameFieldLabelRegex: /^Name/,
    nameFieldDescription: `Exactly as printed on the box, whatever language that is.`,

    otherNameFieldLabelRegex: /^Other name/,
    otherNameFieldDescription: `Optional — what it is called in the other language. Search matches both.`,

    strengthFieldLabel: `Strength`,
    strengthFieldDescription: `Free text — combination products are fine: 500 mg + 65 mg.`,

    formSelectorLabel: `Form`,
    countedInSelectorLabel: `Counted in`,

    manufacturerFieldLabel: `Manufacturer`,
    manufacturerFieldDescription: `Pick one you have used before, or type a new one.`,

    notesFieldLabel: `Notes`,

    prescriptionCheckboxDescription: `Prescription only`,
    expirationCheckboxDescription: `This expires (uncheck for plasters, thermometers…)`,

    pastDateFieldLabel: `Still usable past its date (days)`,
    pastDateFieldDescription: `Leave blank for none. 60 suits paracetamol tablets; keep it at zero for eye drops, sprays, sterile dressings and antibiotics. Only affects what doses are taken from — the expiry list still calls the box expired.`,

    // Active substance section
    activeSubstanceSection: `Active substance (optional)`,

    substanceFieldLabel: `Substance`,
    substanceFieldDescription: `Pick one already used, or type a new one.`,

    amountFieldLabel: `Amount per unit`,
    amountFieldDescription: `Free text: 500 mg, 4000 IU, 0,9%.`,

    // Symptoms section
    symptomsSection: `Used for (optional)`,
    symptomFieldLabel: `Symptom`,
    symptomFieldDescription: `Tagging now is what makes “what do we have for a sore throat” work later. More can be added afterwards.`,

    // Pack size section
    packSizeSection: `Pack size`,
    unitsPerPackFieldLabel: `Units per pack`,
    unitsPerPackFieldDescription: `Required — without a pack size this product cannot hold boxes or be shopped for.`,

    packLabelFieldLabel: `Pack label`,

    pageUrl: `/products/new`,
} as const;

export const PRODUCT_FORM_SELECTOR_VALUES = {
    tablet: `tablet`,
    capsule: `capsule`,
    syrup: `syrup`,
    drops: `drops`,
    sachet: `sachet`,
    spray: `spray`,
    cream: `cream`,
    ointment: `ointment`,
    suppository: `suppository`,
    patch: `patch`,
    injection: `injection`,
    device: `device`,
    other: `other`,
} as const;

export const PRODUCT_UNITS_SELECTOR_VALUES = {
    tablet: `tablet`,
    capsule: `capsule`,
    ml: `ml`,
    g: `g`,
    sachet: `sachet`,
    drop: `drop`,
    ampoule: `ampoule`,
    piece: `piece`,
    dose: `dose`,
} as const;

export class NewProductSubpage {
    readonly page: Page;
    readonly pageTitle: Locator;

    readonly cancelBtn: Locator;
    readonly saveProductBtn: Locator;

    readonly nameField: Locator;
    readonly otherNameField: Locator;
    readonly strengthField: Locator;
    readonly formSelector: Locator;
    readonly countedInSelector: Locator;
    readonly manufacturerField: Locator;
    readonly notesField: Locator;

    readonly prescriptionCheckbox: Locator;
    readonly expirationCheckbox: Locator;

    readonly pastDateField: Locator;

    // Active substance section
    readonly activeSubstanceSection: Locator;
    readonly substanceField: Locator;
    readonly amountField: Locator;

    // Symptoms section
    readonly symptomsSection: Locator;
    readonly symptomField: Locator;

    // Pack size section
    readonly packSizeSection: Locator;
    readonly unitsPerPackField: Locator;
    readonly packLabelField: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`new-trip-title`);

        this.cancelBtn = page.getByRole(`link`, {name: NEW_PRODUCT_TEXTS.cancelBtn});
        this.saveProductBtn = page.getByRole(`button`, {name: NEW_PRODUCT_TEXTS.saveProductBtn});

        this.nameField = page.getByLabel(NEW_PRODUCT_TEXTS.nameFieldLabelRegex);
        this.otherNameField = page.getByLabel(NEW_PRODUCT_TEXTS.otherNameFieldLabelRegex);
        this.strengthField = page.getByLabel(NEW_PRODUCT_TEXTS.strengthFieldLabel);

        this.formSelector = page.getByLabel(NEW_PRODUCT_TEXTS.formSelectorLabel);
        this.countedInSelector = page.getByLabel(NEW_PRODUCT_TEXTS.countedInSelectorLabel);

        this.manufacturerField = page.getByLabel(NEW_PRODUCT_TEXTS.manufacturerFieldLabel);
        this.notesField = page.getByLabel(NEW_PRODUCT_TEXTS.notesFieldLabel);

        this.prescriptionCheckbox = page.getByRole(`checkbox`, {name: NEW_PRODUCT_TEXTS.prescriptionCheckboxDescription});
        this.expirationCheckbox = page.getByRole(`checkbox`, {name: NEW_PRODUCT_TEXTS.expirationCheckboxDescription});

        this.pastDateField = page.getByLabel(NEW_PRODUCT_TEXTS.pastDateFieldLabel);

        this.activeSubstanceSection = page.getByText(NEW_PRODUCT_TEXTS.activeSubstanceSection);
        this.substanceField = page.getByLabel(NEW_PRODUCT_TEXTS.substanceFieldLabel);
        this.amountField = page.getByLabel(NEW_PRODUCT_TEXTS.amountFieldLabel);

        this.symptomsSection = page.getByText(NEW_PRODUCT_TEXTS.symptomsSection)
        this.symptomField = page.getByLabel(NEW_PRODUCT_TEXTS.symptomFieldLabel);

        this.packSizeSection = page.getByText(NEW_PRODUCT_TEXTS.packSizeSection);
        this.unitsPerPackField = page.getByLabel(NEW_PRODUCT_TEXTS.unitsPerPackFieldLabel);
        this.packLabelField = page.getByLabel(NEW_PRODUCT_TEXTS.packLabelFieldLabel);
    }

    async goToPage() {
        await this.page.goto(NEW_PRODUCT_TEXTS.pageUrl);
    }

    async clickCancelBtn() {
        await this.cancelBtn.click();
    }

    async clickSaveProductBtn() {
        await this.saveProductBtn.click();
    }
}

