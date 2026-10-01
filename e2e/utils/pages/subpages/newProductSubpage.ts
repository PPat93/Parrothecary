import {Locator, Page} from "@playwright/test";
import {NEW_TRIP_TEXTS} from "./newTripSubpage";

export const NEW_PRODUCT_TEXTS = {

    // Main items
    title: `New product`,
    cancelBtn: `Cancel`,
    saveProductBtn: `Save product`,

    nameFieldLabel: `Name`,
    nameFieldDescription: `Exactly as printed on the box, whatever language that is.`,

    otherNameFieldLabel: `Other name`,
    otherNameFieldDescription: `Optional — what it is called in the other language. Search matches both.`,

    strengthFieldLabel: `Strength`,
    strengthFieldDescription: `Free text — combination products are fine: 500 mg + 65 mg.`,

    formFieldLabel: `Form`,
    countedInFieldLabel: `Counted in`,

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

    // Size section
    sizeSectionTitle: `Pack size`,
    unitsPerPackFieldLabel: `Units per pack`,
    unitsPerPackFieldDescription: `Required — without a pack size this product cannot hold boxes or be shopped for.`,

    packLabelFieldLabel: `Pack label`,

    newTripUrl: `/products/new`,
}

export const HTML_ITEMS = {
    prescriptionCheckboxName: `isPrescription`,
    expirationCheckboxName: `hasExpiry`,
}

export const PRODUCT_FORM_SELECTOR_VALUES = {}

export const PRODUCT_UNITS_SELECTOR_VALUES = {}

export class NewProductSubpage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly cancelBtn: Locator;
    readonly saveProductBtn: Locator;

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`new-trip-title`);
    }

    async goToPage() {
        await this.page.goto(NEW_TRIP_TEXTS.newTripUrl);
    }

    async clickCancelBtn() {
        await this.cancelBtn.click();
    }

    async clickSaveProductBtn() {
        await this.saveProductBtn.click();
    }
}

