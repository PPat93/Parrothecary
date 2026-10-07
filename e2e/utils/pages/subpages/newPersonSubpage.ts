import {Locator, Page} from "@playwright/test";

export const NEW_PERSON_TEXTS = {
    title: `New person`,
    cancelBtn: `Cancel`,
    addPersonBtn: `Add person`,
    nameFieldLabel: `Name`,
    notesFieldLabel: `Notes`,
    notesDescription: `Optional — allergies, a GP's advice, anything worth remembering.`,
    pageUrl: `/household/new`
} as const;


export class NewPersonSubpage {
    readonly page: Page;
    readonly pageTitle: Locator;
    readonly cancelBtn: Locator;
    readonly addPersonBtn: Locator;
    readonly nameField: Locator;
    readonly notesField: Locator
    readonly notesDescription: Locator

    constructor(page: Page) {
        this.page = page;
        this.pageTitle = page.getByTestId(`new-person-title`);
        this.cancelBtn = page.getByRole(`link`, {name: NEW_PERSON_TEXTS.cancelBtn});
        this.addPersonBtn = page.getByRole(`button`, {name: NEW_PERSON_TEXTS.addPersonBtn});
        this.nameField = page.getByLabel(NEW_PERSON_TEXTS.nameFieldLabel);
        this.notesField = page.getByLabel(NEW_PERSON_TEXTS.notesFieldLabel);
        this.notesDescription = page.getByText(NEW_PERSON_TEXTS.notesDescription);
    }

    async goToPage() {
        await this.page.goto(NEW_PERSON_TEXTS.pageUrl);
    }
}