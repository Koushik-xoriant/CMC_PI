import { expect, Locator, Page, TestInfo } from '@playwright/test';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { resolveLocator } from '../utils/locatorResolver';

type VatSelection = 'default' | 'random-alternative';
type ReceiptUploadMethod = 'computer' | 'drag-and-drop' | 'pending-tray';

export interface ManualExpenseInput {
  description: string;
  netAmount: string;
  vatSelection: VatSelection;
  defaultVatCode: string;
  withReceipt: boolean;
  verifyReceiptUploadFlow?: boolean;
  receiptUploadMethod?: ReceiptUploadMethod;
  receiptFiles?: string[];
  pendingReceiptName?: string;
}

export interface ExpenseChanges {
  description: string;
  grossAmount: string;
  vatSelection: VatSelection;
  defaultVatCode: string;
  // The application keeps Net and recalculates VAT and Gross from it when saving. 'stable'
  // moves the requested Gross to the nearest amount that is saved unchanged whichever
  // way the application rounds VAT; 'as-given' types the requested Gross exactly.
  grossRoundTrip: 'stable' | 'as-given';
}

export interface CreatedExpense {
  description: string;
  contractJobCode: string;
  categoryCode: string;
  vatRateCode: string;
  vatRateLabel: string;
  vatRate: number;
  date: string;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  receiptNames: string[];
}

export interface MileageExpenseInput {
  description: string;
  routeFrom: string;
  routeTo: string;
  vehicleOwnership: 'Personal car' | 'Company car';
  pendingReceiptName?: string;
}

export interface MileageExpenseChanges {
  description: string;
}

export interface CreatedMileageExpense {
  description: string;
  date: string;
  routeFrom: string;
  routeTo: string;
  returnTrip: boolean;
  distance: string;
  vehicleType: string;
  mileageRate: number;
  contractJobCode: string;
  grossAmount: string;
  receiptNames: string[];
}

interface VatOption {
  code: string;
  description: string;
  rate: number;
  label: string;
}

const receiptPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYwAAAABJRU5ErkJggg==',
  'base64',
);
const receiptFileName = 'automation-receipt.png';

export class UnclaimedExpensesPage {
  private readonly expenseRows: Locator;
  private lastExpenseListRequest?: { url: string; headers: Record<string, string> };
  private readonly createdExpenseDescriptions: string[] = [];

  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
  ) {
    this.expenseRows = page.getByRole('row');
    // Remember the app's own list request so totals can be checked against the
    // full data set with the same authentication.
    page.on('request', (request) => {
      if (request.method() === 'GET' && /\/api\/v1\/expenses\?page_num=/.test(request.url())) {
        this.lastExpenseListRequest = { url: request.url(), headers: request.headers() };
      }
    });
  }

  async open(): Promise<void> {
    const unclaimedExpensesLink = this.page
      .getByRole('link', { name: 'Unclaimed Expenses', exact: true })
      .last();
    const loginButton = this.page.getByRole('button', { name: /^log in$/i });
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt += 1) {
      await this.page.goto('/expenses', { waitUntil: 'domcontentloaded' });
      await expect(unclaimedExpensesLink.or(loginButton).first()).toBeVisible({ timeout: 60_000 });
      if (!(await loginButton.isVisible()) || attempt === maxAttempts) {
        break;
      }
      // The stored session is restored by the app on load; a transient API failure
      // during that restore sends the app to the login page. An immediate retry
      // often fails the same way, so pause briefly before navigating again.
      this.testInfo.annotations.push({
        type: 'session-restore-retry',
        description: `The app showed the login page while opening Unclaimed Expenses; retry ${attempt} of ${maxAttempts - 1}.`,
      });
      await this.page.waitForTimeout(10_000);
    }
    await expect(unclaimedExpensesLink).toBeVisible({ timeout: 60_000 });
    const expensesLink = await resolveLocator(
      this.testInfo,
      'Unclaimed Expenses navigation link',
      [
        {
          name: 'accessible link name',
          locator: unclaimedExpensesLink,
        },
        {
          name: 'known expenses route',
          locator: this.page.locator('a[href="/expenses"]'),
        },
      ],
    );
    await expensesLink.click();
    await expect(
      this.expenseRows.first().getByRole('columnheader', { name: 'Date', exact: true }),
    ).toBeVisible({ timeout: 60_000 });
  }

  async createManualExpense(input: ManualExpenseInput): Promise<CreatedExpense> {
    const newExpenseButton = await resolveLocator(
      this.testInfo,
      'New expense button',
      [
        {
          name: 'accessible button name',
          locator: this.page.getByRole('button', { name: 'New expense', exact: true }),
        },
        {
          name: 'visible button text',
          locator: this.page.locator('button').filter({ hasText: /^New expense$/ }),
        },
      ],
    );
    await newExpenseButton.click();
    const manualExpenseOption = await resolveLocator(
      this.testInfo,
      'Create an expense manually option',
      [
        {
          name: 'exact menu text',
          locator: this.page.getByText('Create an expense manually', { exact: true }),
        },
        {
          name: 'menu option name',
          locator: this.page.getByRole('option', { name: 'Create an expense manually', exact: true }),
        },
      ],
    );
    await manualExpenseOption.click();

    const descriptionField = this.page.locator('input[placeholder="Enter a description"]');
    await expect(descriptionField).toBeVisible({ timeout: 60_000 });
    const descriptionInput = await resolveLocator(
      this.testInfo,
      'Expense description field',
      [
        {
          name: 'description placeholder',
          locator: descriptionField,
        },
        {
          name: 'accessible description label',
          locator: this.page.getByRole('textbox', { name: 'Description *' }),
        },
      ],
    );
    await expect(descriptionInput).toBeVisible();
    await descriptionInput.fill(input.description);

    const contractJobCode = await this.selectFirstOption('Contract / Job code *');
    const categoryCode = await this.selectFirstOption('Category *');
    const vatOption = await this.selectVatOption(input.vatSelection, input.defaultVatCode);

    const dateInput = this.page.locator('input[placeholder="dd/mm/yyyy"]');
    const date = await dateInput.inputValue();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
      throw new Error(`The expense form supplied an invalid date "${date}".`);
    }

    const amountInputs = this.page.locator('input[type="number"]');
    if ((await amountInputs.count()) !== 2) {
      throw new Error('Expected gross and net amount fields on the manual expense form.');
    }
    const netCents = Math.round(Number(input.netAmount) * 100);
    if (!Number.isSafeInteger(netCents) || netCents < 0) {
      throw new Error(`Invalid net amount "${input.netAmount}".`);
    }
    const grossCents = Math.round(netCents * (1 + vatOption.rate / 100));
    const grossAmount = (grossCents / 100).toFixed(2);
    await amountInputs.first().fill(grossAmount);
    await amountInputs.last().fill(input.netAmount);

    const receiptNames: string[] = [];
    if (input.withReceipt) {
      const receiptFiles = input.receiptFiles ?? [];
      const uploadMethod = input.receiptUploadMethod ?? 'computer';
      await this.page.getByText('Attach a receipt', { exact: true }).click();
      if (input.verifyReceiptUploadFlow) {
        await expect(
          this.page.getByText('From pending Tray', { exact: true }),
        ).toBeVisible();
      }
      if (uploadMethod === 'pending-tray') {
        receiptNames.push(await this.attachPendingTrayReceipt(input.pendingReceiptName));
      } else {
        await this.page.getByRole('button', { name: 'Upload from computer', exact: true }).click();
        if (uploadMethod === 'drag-and-drop') {
          if (receiptFiles.length === 0) {
            throw new Error('Drag-and-drop receipt uploads require at least one file path.');
          }
          await this.page
            .getByText('Click here or drag and drop files to Upload', { exact: true })
            .drop({ files: receiptFiles });
        } else if (receiptFiles.length > 0) {
          const fileChooserPromise = this.page.waitForEvent('filechooser');
          await this.page.getByText('Click here', { exact: true }).click();
          const fileChooser = await fileChooserPromise;
          await fileChooser.setFiles(receiptFiles);
        } else {
          const fileChooserPromise = this.page.waitForEvent('filechooser');
          await this.page.getByText('Click here', { exact: true }).click();
          const fileChooser = await fileChooserPromise;
          await fileChooser.setFiles({
            name: receiptFileName,
            mimeType: 'image/png',
            buffer: receiptPng,
          });
        }
        receiptNames.push(...(
          receiptFiles.length > 0
            ? receiptFiles.map((file) => path.basename(file))
            : [receiptFileName]
        ));
        const uploadButton = this.page.getByRole('button', { name: 'Upload', exact: true });
        if (input.verifyReceiptUploadFlow) {
          for (const name of receiptNames) {
            await expect(this.page.getByText(name, { exact: true })).toBeVisible();
          }
          await expect(uploadButton).toBeEnabled();
        }
        await uploadButton.click();
      }
      await expect(this.page.getByText(`Receipts (${receiptNames.length})`, { exact: true })).toBeVisible();
      if (input.verifyReceiptUploadFlow) {
        for (const name of receiptNames) {
          await expect(this.page.getByText(name, { exact: true })).toBeVisible();
        }
        await expect(
          this.page.getByRole('button', { name: 'Attach another', exact: true }),
        ).toBeVisible();
      }
    }

    await this.saveExpenseForm(input.description);
    this.createdExpenseDescriptions.push(input.description);
    return {
      description: input.description,
      contractJobCode,
      categoryCode,
      vatRateCode: vatOption.code,
      vatRateLabel: vatOption.label,
      vatRate: vatOption.rate,
      date,
      netAmount: input.netAmount,
      vatAmount: ((grossCents - netCents) / 100).toFixed(2),
      grossAmount,
      receiptNames,
    };
  }

  async createMileageExpense(input: MileageExpenseInput): Promise<CreatedMileageExpense> {
    const newMileageExpenseButton = await resolveLocator(
      this.testInfo,
      'New mileage expense button',
      [
        {
          name: 'accessible button name',
          locator: this.page.getByRole('button', { name: 'New mileage expense', exact: true }),
        },
      ],
    );
    await newMileageExpenseButton.click();
    await expect(
      this.page.locator('app-mileage-expense-form').getByText('New mileage expense', { exact: true }),
    ).toBeVisible();

    const routeInputs = this.page.getByRole('textbox', { name: 'Address or postcode', exact: true });
    await expect(routeInputs).toHaveCount(2, { timeout: 60_000 });
    await this.selectRouteAddress(routeInputs.first(), input.routeFrom);
    await this.selectRouteAddress(routeInputs.last(), input.routeTo);
    // Google replaces each postcode with the full address it selected.
    const routeFrom = await routeInputs.first().inputValue();
    const routeTo = await routeInputs.last().inputValue();
    // Google calculates the distance once both ends of the route are chosen.
    const distanceText = this.page.locator('.mileage-route__distance');
    await expect(distanceText).toHaveText(/^\s*\d+(\.\d+)? Miles\s*$/, { timeout: 30_000 });
    const distance = (await distanceText.innerText()).trim();

    const descriptionInput = this.page.locator('input[placeholder="Enter a description"]');
    await descriptionInput.fill(input.description);

    const dateInput = this.page.locator('input[placeholder="dd/mm/yyyy"]');
    const date = await dateInput.inputValue();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
      throw new Error(`The mileage expense form supplied an invalid date "${date}".`);
    }

    await this.page.getByRole('radio', { name: input.vehicleOwnership, exact: true }).check();
    const vehicleType = await this.selectFirstOption('Vehicle type');
    const contractJobCode = await this.selectFirstOption('Contract / Job code');

    const mileageRate = this.parseCurrency(
      await this.page.locator('.mileage-rate + div').innerText(),
    );
    const amountToClaim = this.page.locator('.amount-to-claim + div');
    await expect(amountToClaim).not.toHaveText(/^\s*£0\.00\s*$/);
    const grossAmount = this.parseCurrency(await amountToClaim.innerText()).toFixed(2);

    const receiptNames: string[] = [];
    if (input.pendingReceiptName) {
      await this.page.getByRole('button', { name: 'Attach a receipt', exact: true }).click();
      receiptNames.push(await this.attachPendingTrayReceipt(input.pendingReceiptName));
      await expect(this.page.getByText('Receipts (1)', { exact: true })).toBeVisible();
      await expect(this.page.getByText(receiptNames[0], { exact: true })).toBeVisible();
    }

    await this.saveExpenseForm(input.description);
    this.createdExpenseDescriptions.push(input.description);
    return {
      description: input.description,
      date,
      routeFrom,
      routeTo,
      returnTrip: false,
      distance,
      vehicleType,
      mileageRate,
      contractJobCode,
      grossAmount,
      receiptNames,
    };
  }

  async verifyMileageVatNotChargedOnWholeAmount(
    expense: CreatedMileageExpense,
    standardVatRate: number,
  ): Promise<void> {
    const row = this.getExpenseRow(expense.description);
    await expect(row).toHaveCount(1);
    const cells = row.getByRole('cell');
    const [netCents, vatCents, grossCents] = await Promise.all(
      [8, 9, 10].map(async (columnIndex) =>
        Math.round(this.parseCurrency(await cells.nth(columnIndex).innerText()) * 100),
      ),
    );
    expect(grossCents, 'The Gross column should show the amount to claim.').toBe(
      Math.round(Number(expense.grossAmount) * 100),
    );
    expect(netCents + vatCents, 'Net and VAT should add up to Gross.').toBe(grossCents);

    // VAT is only reclaimable on the fuel element of a mileage claim (CMC-36433), so
    // it must not be the standard rate taken from the whole VAT-inclusive amount.
    const { netCents: wholeAmountNetCents } = this.netFromGross(expense.grossAmount, standardVatRate);
    expect(
      vatCents,
      'VAT should not be charged at the standard rate on the whole amount to claim.',
    ).not.toBe(grossCents - wholeAmountNetCents);
  }

  async reopenMileageExpense(expense: CreatedMileageExpense): Promise<void> {
    const row = this.getExpenseRow(expense.description);
    await expect(row).toHaveCount(1);
    await row.dblclick();

    const descriptionInput = this.page.locator('input[placeholder="Enter a description"]');
    await expect(descriptionInput).toBeVisible();
    await expect(descriptionInput).toHaveValue(expense.description);
    await expect(this.page.locator('input[placeholder="dd/mm/yyyy"]')).toHaveValue(expense.date);
    const routeInputs = this.page.getByRole('textbox', { name: 'Address or postcode', exact: true });
    await expect(routeInputs.first()).toHaveValue(expense.routeFrom);
    await expect(routeInputs.last()).toHaveValue(expense.routeTo);
    await expect(this.returnTripToggle()).toHaveAttribute(
      'aria-pressed',
      String(expense.returnTrip),
    );
    await expect(this.page.locator('.mileage-route__distance')).toHaveText(expense.distance);
    await expect(
      this.page.locator('eq2-input').filter({ hasText: 'Vehicle type' }).locator('input'),
    ).toHaveAttribute('placeholder', expense.vehicleType);
    await expect(
      this.page.locator('eq2-input').filter({ hasText: 'Contract / Job code' }).locator('input'),
    ).toHaveAttribute('placeholder', expense.contractJobCode);
    await expect(this.page.locator('.amount-to-claim + div')).toHaveText(
      new RegExp(`£${expense.grossAmount.replace('.', '\\.')}`),
    );
    await expect(
      this.page.getByText(`Receipts (${expense.receiptNames.length})`, { exact: true }),
    ).toBeVisible();
    for (const name of expense.receiptNames) {
      await expect(this.page.getByText(name, { exact: true })).toBeVisible();
    }
  }

  async editMileageExpense(
    expense: CreatedMileageExpense,
    changes: MileageExpenseChanges,
  ): Promise<CreatedMileageExpense> {
    // Call after reopenMileageExpense, while the saved expense is open in the edit form.
    // Marks the journey as a return trip and moves it to a different contract.
    await expect(this.page.getByText('Edit mileage expense', { exact: true })).toBeVisible();
    if (expense.returnTrip) {
      throw new Error('Editing expects a one-way journey so that Return trip can be switched on.');
    }

    await this.page.locator('input[placeholder="Enter a description"]').fill(changes.description);

    await this.page.getByRole('button', { name: 'Return trip', exact: true }).click();
    await expect(this.returnTripToggle()).toHaveAttribute('aria-pressed', 'true');
    // Return trip doubles the journey (CMC-33748 AC4). Both values are rounded for
    // display, so allow for the last digit.
    const distanceText = this.page.locator('.mileage-route__distance');
    await expect
      .poll(async () => Math.abs(this.parseMiles(await distanceText.innerText()) - 2 * this.parseMiles(expense.distance)), {
        message: 'Return trip should double the journey distance.',
      })
      .toBeLessThanOrEqual(0.1);
    const amountToClaim = this.page.locator('.amount-to-claim + div');
    const originalCents = Math.round(Number(expense.grossAmount) * 100);
    await expect
      .poll(async () => Math.abs(Math.round(this.parseCurrency(await amountToClaim.innerText()) * 100) - 2 * originalCents), {
        message: 'Return trip should double the amount to claim.',
      })
      .toBeLessThanOrEqual(1);

    const contractJobCode = await this.selectDifferentOption('Contract / Job code', expense.contractJobCode);
    const distance = (await distanceText.innerText()).trim();
    const grossAmount = this.parseCurrency(await amountToClaim.innerText()).toFixed(2);

    await this.saveExpenseForm(changes.description);
    await expect(this.getExpenseRow(expense.description)).toHaveCount(0);
    const trackedIndex = this.createdExpenseDescriptions.indexOf(expense.description);
    if (trackedIndex >= 0) {
      this.createdExpenseDescriptions[trackedIndex] = changes.description;
    }
    return {
      ...expense,
      description: changes.description,
      returnTrip: true,
      distance,
      contractJobCode,
      grossAmount,
    };
  }

  async verifyMileageExpenseListed(expense: CreatedMileageExpense): Promise<Locator> {
    const row = this.getExpenseRow(expense.description);
    await expect(row).toHaveCount(1);
    const cells = row.getByRole('cell');
    await expect(cells.nth(1)).toHaveText(expense.date);
    await expect(cells.nth(6)).toContainText(expense.contractJobCode);
    expect(
      Math.round(this.parseCurrency(await cells.nth(10).innerText()) * 100),
      'The Gross column should show the amount to claim.',
    ).toBe(Math.round(Number(expense.grossAmount) * 100));
    return row;
  }

  async verifyRouteMapShown(): Promise<void> {
    // Call after reopenMileageExpense. A saved expense shows its route as an image,
    // so check that the image actually loaded rather than only that it is present.
    const routeMap = this.page.getByRole('img', { name: 'Route map', exact: true });
    await expect(routeMap).toBeVisible();
    await expect
      .poll(
        () => routeMap.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
        { message: 'The route map image should load when viewing a saved mileage expense.' },
      )
      .toBe(true);
  }

  async openReceiptSmartCapture(): Promise<void> {
    const newExpenseButton = await resolveLocator(
      this.testInfo,
      'New expense button',
      [
        {
          name: 'accessible button name',
          locator: this.page.getByRole('button', { name: 'New expense', exact: true }),
        },
        {
          name: 'visible button text',
          locator: this.page.locator('button').filter({ hasText: /^New expense$/ }),
        },
      ],
    );
    await newExpenseButton.click();

    const captureOption = this.page.getByText('Capture values from a receipt', { exact: true });
    await expect(captureOption).toBeVisible();
    await captureOption.click();
  }

  async openComputerReceiptUploadModal(): Promise<void> {
    await expect(
      this.page.getByText('Upload new image or use Pending tray?', { exact: true }),
    ).toBeVisible();
    const uploadOption = this.page.getByText('Upload a receipt from your computer', {
      exact: true,
    });
    await expect(uploadOption).toBeVisible();
    await uploadOption.click();
    await expect(this.page.getByText('Upload a receipt', { exact: true })).toBeVisible();
    await expect(
      this.page.getByRole('button', { name: 'Create my expense', exact: true }),
    ).toBeDisabled();
  }

  async uploadSmartCaptureReceipt(receiptFile: string): Promise<string> {
    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await this.page.getByText('Click here', { exact: true }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(receiptFile);

    const receiptName = path.basename(receiptFile);
    await expect(this.page.getByText(receiptName, { exact: true })).toBeVisible();
    await expect(
      this.page.getByRole('button', { name: 'Create my expense', exact: true }),
    ).toBeEnabled();
    return receiptName;
  }

  async openPendingTrayReceiptModal(): Promise<void> {
    const pendingTrayOption = this.page.getByText('Use a receipt from Pending Tray', {
      exact: true,
    });
    await expect(pendingTrayOption).toBeVisible();
    await pendingTrayOption.click();
    await expect(this.page.getByText('Upload a receipt', { exact: true })).toBeVisible();
  }

  async verifySmartCaptureReceiptAvailable(receiptName: string): Promise<Locator> {
    const receiptOption = this.page
      .getByRole('button', { name: 'Toggle attachment selection' })
      .filter({ hasText: receiptName });
    await expect(
      receiptOption,
      `"${receiptName}" should be listed as an unprocessed pending-tray receipt.`,
    ).toHaveCount(1, { timeout: 30_000 });
    return receiptOption;
  }

  async selectSmartCaptureReceipt(receiptName: string): Promise<void> {
    const receiptOption = await this.verifySmartCaptureReceiptAvailable(receiptName);
    await receiptOption.click();
    const createExpenseButton = this.page.getByRole('button', {
      name: 'Create my expense',
      exact: true,
    });
    await expect(createExpenseButton).toBeEnabled();
  }

  async createExpenseFromSmartCapture(): Promise<void> {
    const createExpenseButton = this.page.getByRole('button', {
      name: 'Create my expense',
      exact: true,
    });
    await createExpenseButton.click();
    await expect(this.page.locator('input[placeholder="dd/mm/yyyy"]')).toBeVisible();
  }

  async verifySmartCapturedValues(expected: {
    vendor: string;
    date: string;
    grossAmount: string;
    netAmount: string;
    taxCode: RegExp;
  }): Promise<void> {
    const vendorInput = this.page
      .locator('eq2-input')
      .filter({ hasText: /^Vendor/ })
      .locator('input');
    const dateInput = this.page.locator('input[placeholder="dd/mm/yyyy"]');

    const amountInputs = this.page.locator('input[type="number"]');
    await expect(amountInputs).toHaveCount(2);

    const taxCodeInput = this.page
      .locator('eq2-input')
      .filter({ hasText: /^(VAT|Tax Code)/ })
      .locator('input');

    // Smart capture queues the receipt and fills the form once recognition finishes,
    // so keep reading the fields until they settle on the captured values.
    await expect
      .poll(
        async () => ({
          vendor: await vendorInput.inputValue(),
          date: await dateInput.inputValue(),
          grossAmount: await amountInputs.first().inputValue(),
          netAmount: await amountInputs.last().inputValue(),
          taxCode:
            (await taxCodeInput.getAttribute('placeholder')) ?? await taxCodeInput.inputValue(),
        }),
        { message: 'Smart capture should fill the expense form from the receipt.', timeout: 120_000 },
      )
      .toEqual({
        vendor: expected.vendor,
        date: expected.date,
        grossAmount: expected.grossAmount,
        netAmount: expected.netAmount,
        taxCode: expect.stringMatching(expected.taxCode),
      });
  }

  async verifySmartCaptureReceiptAttached(receiptName: string): Promise<void> {
    await expect(
      this.page.getByText('Receipts (1)', { exact: true }),
    ).toBeVisible();
    await expect(this.page.getByText(receiptName, { exact: true })).toBeVisible();
  }

  async verifyListColumns(): Promise<void> {
    const headers = (
      await this.expenseRows.first().getByRole('columnheader').allTextContents()
    ).map((header) => header.trim());
    const expectedHeaders = [
      'Date',
      'Description',
      'Type',
      'Category',
      'VAT Rate',
      'Contract/Job',
      'Receipt',
      'Net',
      'VAT',
      'GROSS',
    ];

    let previousHeaderIndex = -1;
    for (const header of expectedHeaders) {
      const headerIndex = headers.findIndex((candidate) =>
        header === 'Contract/Job' ? candidate.startsWith(header) : candidate === header,
      );
      expect(
        headerIndex,
        `Expected the "${header}" column on the Unclaimed Expenses list.`,
      ).toBeGreaterThan(previousHeaderIndex);
      previousHeaderIndex = headerIndex;
    }
  }

  async verifyExpenseVisible(expense: CreatedExpense, expectedNetAmount: string): Promise<Locator> {
    const row = this.getExpenseRow(expense.description);
    await expect(row).toHaveCount(1);
    const cells = row.getByRole('cell');
    await expect(row.getByRole('cell').nth(2)).toHaveText(expense.description);
    await expect(cells.nth(1)).toHaveText(expense.date);
    await expect(cells.nth(4)).toHaveText(expense.categoryCode);
    await expect(cells.nth(5)).toHaveText(expense.vatRateLabel);
    await expect(cells.nth(6)).toContainText(expense.contractJobCode);
    await expect(cells.nth(8)).not.toBeEmpty();
    await expect(cells.nth(9)).not.toBeEmpty();
    await expect(cells.nth(10)).not.toBeEmpty();
    const expectedAmounts = [
      { columnIndex: 8, amount: expectedNetAmount, label: 'Net' },
      { columnIndex: 9, amount: expense.vatAmount, label: 'VAT' },
      { columnIndex: 10, amount: expense.grossAmount, label: 'Gross' },
    ];
    for (const expected of expectedAmounts) {
      expect(
        Math.round(this.parseCurrency(await cells.nth(expected.columnIndex).innerText()) * 100),
        `The ${expected.label} column should show the amount entered on the expense form.`,
      ).toBe(Math.round(Number(expected.amount) * 100));
    }
    return row;
  }

  async reopenExpense(expense: CreatedExpense): Promise<void> {
    const row = this.getExpenseRow(expense.description);
    await expect(row).toHaveCount(1);
    await row.dblclick();

    const descriptionInput = this.page.locator('input[placeholder="Enter a description"]');
    await expect(descriptionInput).toBeVisible();
    await expect(descriptionInput).toHaveValue(expense.description);

    const dateInput = this.page.locator('input[placeholder="dd/mm/yyyy"]');
    await expect(dateInput).toHaveValue(expense.date);

    const amountInputs = this.page.locator('input[type="number"]');
    await expect(amountInputs).toHaveCount(2);
    await expect(amountInputs.first()).toHaveValue(expense.grossAmount);
    await expect(amountInputs.last()).toHaveValue(expense.netAmount);

    const contractJobInput = this.page
      .locator('eq2-input')
      .filter({ hasText: 'Contract / Job code *' })
      .locator('input');
    const categoryInput = this.page
      .locator('eq2-input')
      .filter({ hasText: 'Category *' })
      .locator('input');
    const vatInput = this.page
      .locator('eq2-input')
      .filter({ hasText: /^VAT/ })
      .locator('input');
    await expect(contractJobInput).toHaveAttribute('placeholder', expense.contractJobCode);
    await expect(categoryInput).toHaveAttribute('placeholder', expense.categoryCode);
    await expect(vatInput).toHaveAttribute('placeholder', expense.vatRateLabel);
    await expect(
      this.page.getByText(`Receipts (${expense.receiptNames.length})`, { exact: true }),
    ).toBeVisible();
    for (const name of expense.receiptNames) {
      await expect(this.page.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(this.page.getByText('Draft', { exact: true })).toBeVisible();
  }

  async editExpense(expense: CreatedExpense, changes: ExpenseChanges): Promise<CreatedExpense> {
    // Call after reopenExpense, while the saved expense is open in the edit form.
    await expect(this.page.getByText('Edit expense', { exact: true })).toBeVisible();

    const descriptionInput = this.page.locator('input[placeholder="Enter a description"]');
    await descriptionInput.fill(changes.description);

    const vatOption = await this.selectVatOption(changes.vatSelection, changes.defaultVatCode);
    const grossAmount = this.grossForRoundTrip(changes.grossAmount, vatOption.rate, changes.grossRoundTrip);
    const { grossCents, netCents, netAmount } = this.netFromGross(grossAmount, vatOption.rate);

    // Both amounts are entered after the VAT rate is chosen; changing Gross alone does
    // not recalculate Net on the edit form (CMC-35911).
    const amountInputs = this.page.locator('input[type="number"]');
    await expect(amountInputs).toHaveCount(2);
    await amountInputs.first().fill(grossAmount);
    await amountInputs.last().fill(netAmount);

    await this.saveExpenseForm(changes.description);
    await expect(this.getExpenseRow(expense.description)).toHaveCount(0);
    const trackedIndex = this.createdExpenseDescriptions.indexOf(expense.description);
    if (trackedIndex >= 0) {
      this.createdExpenseDescriptions[trackedIndex] = changes.description;
    }
    return {
      ...expense,
      description: changes.description,
      vatRateCode: vatOption.code,
      vatRateLabel: vatOption.label,
      vatRate: vatOption.rate,
      netAmount,
      vatAmount: ((grossCents - netCents) / 100).toFixed(2),
      grossAmount,
    };
  }

  private grossForRoundTrip(
    requestedGross: string,
    vatRate: number,
    roundTrip: ExpenseChanges['grossRoundTrip'],
  ): string {
    if (roundTrip === 'as-given') {
      return requestedGross;
    }
    // On save the application keeps Net and sets Gross to Net plus VAT. Its exact VAT
    // rounding is unknown (half-penny amounts were rounded down on alpha), so only use
    // an amount whose VAT rounds to the same penny by rounding or by truncation.
    const startCents = this.netFromGross(requestedGross, vatRate).grossCents;
    for (let grossCents = startCents; grossCents < startCents + 1_000; grossCents += 1) {
      const { netCents } = this.netFromGross((grossCents / 100).toFixed(2), vatRate);
      const vatCents = (netCents * vatRate) / 100;
      const roundedVatCents = Math.round(vatCents);
      const truncatedVatCents = Math.floor(vatCents + 1e-6);
      if (roundedVatCents === truncatedVatCents && netCents + roundedVatCents === grossCents) {
        return (grossCents / 100).toFixed(2);
      }
    }
    throw new Error(`No stable gross amount found near ${requestedGross} at ${vatRate}% VAT.`);
  }

  async verifyNetRecalculatedWhenGrossEdited(
    expense: CreatedExpense,
    grossAmount: string,
  ): Promise<void> {
    // Call after reopenExpense; the form is left unsaved.
    await expect(this.page.getByText('Edit expense', { exact: true })).toBeVisible();
    const { netAmount } = this.netFromGross(grossAmount, expense.vatRate);
    const amountInputs = this.page.locator('input[type="number"]');
    await expect(amountInputs).toHaveCount(2);
    await amountInputs.first().fill(grossAmount);
    await amountInputs.first().press('Tab');
    await expect(
      amountInputs.last(),
      'Net should be recalculated from the VAT rate when Gross is edited.',
    ).toHaveValue(netAmount);
  }

  private netFromGross(
    grossAmount: string,
    vatRate: number,
  ): { grossCents: number; netCents: number; netAmount: string } {
    const grossCents = Math.round(Number(grossAmount) * 100);
    if (!Number.isSafeInteger(grossCents) || grossCents < 0) {
      throw new Error(`Invalid gross amount "${grossAmount}".`);
    }
    const netCents = Math.round(grossCents / (1 + vatRate / 100));
    return { grossCents, netCents, netAmount: (netCents / 100).toFixed(2) };
  }

  async verifyDateFormatAndDescendingOrder(): Promise<void> {
    const dateValues: string[] = [];
    const rowCount = await this.expenseRows.count();
    for (let index = 1; index < rowCount; index += 1) {
      const date = (await this.expenseRows.nth(index).getByRole('cell').nth(1).innerText()).trim();
      expect(date, 'Expense dates must use DD/MM/YYYY format.').toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      dateValues.push(date);
    }

    const dateNumbers = dateValues.map((value) => {
      const [day, month, year] = value.split('/').map(Number);
      return Date.UTC(year, month - 1, day);
    });
    for (let index = 1; index < dateNumbers.length; index += 1) {
      expect(
        dateNumbers[index - 1],
        'Expenses must be ordered newest first.',
      ).toBeGreaterThanOrEqual(dateNumbers[index]);
    }
  }

  async verifyManualExpenseIcon(row: Locator): Promise<void> {
    const iconStyle = await row.getByRole('cell').nth(3).locator('eq2-icon-svg').getAttribute('style');
    expect(iconStyle).toContain('payment_16_filled.svg');
  }

  async verifyReceiptIcon(row: Locator, expected: boolean): Promise<void> {
    const receiptIcon = row.getByRole('cell').nth(7).locator('eq2-icon[name="attach"]');
    if (expected) {
      await expect(receiptIcon).toBeVisible();
    } else {
      await expect(receiptIcon).toHaveCount(0);
    }
  }

  async verifyFooterTotals(): Promise<void> {
    const footer = this.page.locator('.task-wrapper').filter({ hasText: /Total claimed/i });
    await expect(footer).toBeVisible();
    const footerValues = await footer.locator('.task-value').allTextContents();
    expect(footerValues).toHaveLength(3);

    // Paging through the list can repeat or skip expenses that share a date (an
    // accepted defect), so total every expense from one unpaged request instead.
    const expenses = await this.fetchAllExpenses();
    const rowTotalsCents = (['net', 'taxAmount', 'gross'] as const).map((field) =>
      expenses.reduce((total, expense) => total + Math.round(expense[field] * 100), 0),
    );

    footerValues.forEach((value, index) => {
      const footerTotalCents = Math.round(this.parseCurrency(value) * 100);
      expect(
        footerTotalCents,
        `Footer total ${index + 1} should equal the sum of its column across all unclaimed expenses.`,
      ).toBe(rowTotalsCents[index]);
    });
  }

  private async selectDifferentOption(fieldLabel: string, currentValue: string): Promise<string> {
    const field = this.page.locator('eq2-input').filter({ hasText: fieldLabel }).locator('input');
    await expect(field).toBeVisible();
    await field.click();

    const options = this.page.getByRole('listbox').last().getByRole('option');
    await expect(options.first()).toBeVisible({ timeout: 30_000 });
    const escapedValue = currentValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const alternative = options
      .filter({ hasNotText: new RegExp(`^\\s*${escapedValue}(\\s|$)`) })
      .first();
    await expect(alternative, `"${fieldLabel}" needs an option other than "${currentValue}".`).toBeVisible();
    await alternative.click();

    const selectedValue = await field.getAttribute('placeholder');
    if (!selectedValue || selectedValue === currentValue) {
      throw new Error(`Selecting a different value did not change "${fieldLabel}".`);
    }
    return selectedValue;
  }

  private returnTripToggle(): Locator {
    // The pressed state is kept on the eq2-button host, not on its inner button.
    return this.page.locator('eq2-button').filter({ hasText: 'Return trip' });
  }

  private parseMiles(value: string): number {
    const miles = Number(value.replace(/miles/i, '').trim());
    if (!Number.isFinite(miles)) {
      throw new Error(`Unable to parse mileage distance "${value}".`);
    }
    return miles;
  }

  private async selectFirstOption(fieldLabel: string): Promise<string> {
    const field = await resolveLocator(
      this.testInfo,
      `${fieldLabel} dropdown`,
      [
        {
          name: 'labelled application dropdown',
          locator: this.page.locator('eq2-input').filter({ hasText: fieldLabel }).locator('input'),
        },
      ],
    );
    await expect(field).toBeVisible();
    const initialPlaceholder = await field.getAttribute('placeholder');
    await field.click();

    const listbox = this.page.getByRole('listbox').last();
    const firstOption = listbox.getByRole('option').first();
    await expect(firstOption).toBeVisible({ timeout: 30_000 });
    await firstOption.click();

    const selectedValue = await field.getAttribute('placeholder');
    if (!selectedValue || selectedValue === initialPlaceholder) {
      throw new Error(`Selecting a dropdown value did not populate "${fieldLabel}".`);
    }
    return selectedValue;
  }

  private async attachPendingTrayReceipt(receiptName?: string): Promise<string> {
    // Call after "Attach a receipt" has opened the attach menu on an expense form.
    await this.page.getByText('From pending Tray', { exact: true }).click();
    let pendingAttachments = this.page.getByRole('button', {
      name: 'Toggle attachment selection',
    });
    if (receiptName) {
      pendingAttachments = pendingAttachments.filter({ hasText: receiptName });
      await expect(
        pendingAttachments,
        `"${receiptName}" should be listed as an unprocessed pending-tray receipt.`,
      ).toHaveCount(1, { timeout: 30_000 });
    }
    const noPendingAttachments = this.page.getByText(
      'No unprocessed emails found.',
      { exact: true },
    );
    await expect
      .poll(
        async () =>
          (await pendingAttachments.count()) + (await noPendingAttachments.isVisible() ? 1 : 0),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
    const pendingAttachmentCount = await pendingAttachments.count();
    if (pendingAttachmentCount === 0) {
      throw new Error('No pending-tray attachments are available to add to the expense.');
    }
    const pendingAttachment = pendingAttachments.first();
    const attachedName = (await pendingAttachment.innerText()).trim();
    await pendingAttachment.click();
    const attachButton = this.page.getByRole('button', { name: 'Attach', exact: true });
    await expect(attachButton).toBeEnabled();
    await attachButton.click();
    return attachedName;
  }

  private async selectRouteAddress(routeInput: Locator, address: string): Promise<void> {
    await routeInput.fill(address);
    // Google Places lists its suggestions in a container appended to the page body.
    const suggestion = this.page.locator('.pac-container:visible .pac-item').first();
    await expect(suggestion).toBeVisible({ timeout: 30_000 });
    await suggestion.click();
    await expect(routeInput).not.toHaveValue(address);
  }

  private async selectVatOption(
    selection: VatSelection,
    defaultVatCode: string,
  ): Promise<VatOption> {
    const vatField = await resolveLocator(
      this.testInfo,
      'VAT rate dropdown',
      [
        {
          name: 'VAT-labelled application dropdown',
          locator: this.page.locator('eq2-input').filter({ hasText: /^VAT/ }).locator('input'),
        },
        {
          name: 'VAT input control',
          locator: this.page.locator('input[placeholder="Standard rated transactions"]'),
        },
      ],
    );
    await expect(vatField).toBeVisible();
    await vatField.click();

    const listbox = this.page.getByRole('listbox').last();
    await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 30_000 });
    const optionLocators = await listbox.getByRole('option').all();

    const options: VatOption[] = [];
    for (const locator of optionLocators) {
      const columns = (await locator.locator('.item-column').allTextContents()).map((value) =>
        value.trim(),
      );
      if (columns.length !== 3) {
        throw new Error(`Unexpected VAT option format: "${(await locator.innerText()).trim()}".`);
      }
      const [code, description, rateText] = columns;
      const rate = Number(rateText.replace(/,/g, ''));
      if (!code || !Number.isFinite(rate) || rate < 0) {
        throw new Error(`Invalid VAT option "${(await locator.innerText()).trim()}".`);
      }
      options.push({
        code,
        description,
        rate,
        label: description || code,
      });
    }

    const defaultOption = options.find((option) => option.code === defaultVatCode);
    if (!defaultOption) {
      throw new Error(`Default VAT code "${defaultVatCode}" was not available in the dropdown.`);
    }

    let selectedOption = defaultOption;
    if (selection === 'random-alternative') {
      const alternatives = options.filter((option) => option.code !== defaultVatCode);
      if (alternatives.length === 0) {
        throw new Error(`No VAT option other than "${defaultVatCode}" was available.`);
      }
      selectedOption = alternatives[randomInt(alternatives.length)];
    }

    const searchField = this.page.getByPlaceholder('Type to search');
    await searchField.fill(selectedOption.code);
    const matchingOption = listbox.getByRole('option').first();
    await expect(matchingOption).toBeVisible();
    await expect(matchingOption.locator('.item-column').first()).toHaveText(
      selectedOption.code,
    );
    await matchingOption.click();
    await expect(vatField).toHaveAttribute('placeholder', selectedOption.label);
    return {
      code: selectedOption.code,
      description: selectedOption.description,
      rate: selectedOption.rate,
      label: selectedOption.label,
    };
  }

  async openDeleteConfirmation(): Promise<void> {
    // Call while an expense is open in the edit form.
    const deleteButton = this.page.getByRole('button', { name: 'Delete expense', exact: true });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();
    const dialog = this.deleteConfirmationDialog();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Delete the expense', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  }

  async cancelDelete(expense: CreatedExpense): Promise<void> {
    const dialog = this.deleteConfirmationDialog();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(this.page.locator('input[placeholder="Enter a description"]')).toHaveValue(
      expense.description,
    );
  }

  async confirmDelete(expense: CreatedExpense): Promise<void> {
    await this.deleteConfirmationDialog()
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(this.page).toHaveURL(/\/expenses(?:\?.*)?$/, { timeout: 60_000 });
    await expect(
      this.expenseRows.first().getByRole('columnheader', { name: 'Date', exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(this.getExpenseRow(expense.description)).toHaveCount(0);
    // The list check covers only the visible page, so confirm against every expense too.
    const remaining = await this.fetchAllExpenses();
    expect(
      remaining.filter((candidate) => candidate.description === expense.description),
      'The deleted expense should no longer be an unclaimed expense.',
    ).toEqual([]);
    const trackedIndex = this.createdExpenseDescriptions.indexOf(expense.description);
    if (trackedIndex >= 0) {
      this.createdExpenseDescriptions.splice(trackedIndex, 1);
    }
  }

  async verifyExpensesNotUnclaimed(descriptions: string[]): Promise<void> {
    // Checks every unclaimed expense, not just the visible page of the list.
    const stillUnclaimed = (await this.fetchAllExpenses())
      .map((expense) => expense.description)
      .filter((description) => descriptions.includes(description));
    expect(stillUnclaimed, 'Expenses added to a claim should no longer be unclaimed.').toEqual([]);
  }

  async cleanUpCreatedExpenses(deleteRecords: boolean): Promise<void> {
    if (this.createdExpenseDescriptions.length === 0) {
      return;
    }
    const allExpenses = await this.fetchAllExpenses();
    const created = this.createdExpenseDescriptions.map((description) => ({
      description,
      id: allExpenses.find((expense) => expense.description === description)?.id,
    }));
    // Recorded before deletion so the report keeps evidence of what the test created.
    await this.testInfo.attach('created-expenses', {
      body: JSON.stringify(
        {
          outcome: deleteRecords
            ? 'Deleted after the test passed.'
            : 'Kept in Unclaimed Expenses for investigation because the test failed.',
          expenses: created,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    if (!deleteRecords) {
      return;
    }

    for (const expense of created) {
      if (expense.id === undefined) {
        throw new Error(`Created expense "${expense.description}" was not found for clean-up.`);
      }
      // Clean-up uses the request the manual expense form's Delete button sends, which
      // is much faster than opening each form; CMC-35279 covers deleting through the UI.
      await this.deleteExpenseThroughApi(expense.id);
    }
    const remainingIds = new Set((await this.fetchAllExpenses()).map((expense) => expense.id));
    const notDeleted = created.filter((expense) => remainingIds.has(expense.id!));
    expect(notDeleted, 'Every expense the test created should be deleted.').toEqual([]);
  }

  private async deleteExpenseThroughApi(id: number): Promise<void> {
    if (!this.lastExpenseListRequest) {
      throw new Error('The Unclaimed Expenses list request was not observed, so the expense cannot be deleted.');
    }
    const expenseUrl = new URL(`/api/v1/expenses/${id}`, this.lastExpenseListRequest.url);
    const response = await this.page.request.delete(expenseUrl.toString(), {
      headers: this.lastExpenseListRequest.headers,
    });
    expect(response.ok(), `Deleting expense ${id} should succeed.`).toBe(true);
  }

  private async fetchAllExpenses(): Promise<
    { id: number; description: string; net: number; taxAmount: number; gross: number }[]
  > {
    if (!this.lastExpenseListRequest) {
      throw new Error('The Unclaimed Expenses list request was not observed, so expenses cannot be read.');
    }
    const allExpensesUrl = new URL(this.lastExpenseListRequest.url);
    allExpensesUrl.searchParams.set('page_num', '1');
    allExpensesUrl.searchParams.set('per_page', '500');
    const response = await this.page.request.get(allExpensesUrl.toString(), {
      headers: this.lastExpenseListRequest.headers,
    });
    expect(response.ok(), 'The unpaged expense list request should succeed.').toBe(true);
    const body = await response.json();
    const expenses = body.data;
    expect(
      expenses,
      'The unpaged request should return every unclaimed expense.',
    ).toHaveLength(body.pagination.totalRecordsCount);
    expect(
      new Set(expenses.map((expense: { id: number }) => expense.id)).size,
      'Each unclaimed expense should be returned once.',
    ).toBe(expenses.length);
    return expenses;
  }

  private async saveExpenseForm(description: string): Promise<void> {
    const saveButton = await resolveLocator(
      this.testInfo,
      'Save Expense button',
      [
        {
          name: 'accessible button name',
          locator: this.page.getByRole('button', { name: 'Save Expense', exact: true }),
        },
        {
          name: 'button text',
          locator: this.page.locator('button').filter({ hasText: /^Save Expense$/ }),
        },
      ],
    );
    await saveButton.click();
    await expect(this.page).toHaveURL(/\/expenses(?:\?.*)?$/);

    const row = this.getExpenseRow(description);
    // The list can take well over the default timeout to reload after saving.
    await expect(row).toHaveCount(1, { timeout: 60_000 });
  }

  private deleteConfirmationDialog(): Locator {
    // The eq2-modal host has no size of its own, so target its visible content box.
    return this.page
      .locator('eq2-modal .modal-content')
      .filter({ hasText: 'This cannot be undone. Are you sure?' });
  }

  private getExpenseRow(description: string): Locator {
    return this.expenseRows.filter({
      has: this.page.getByRole('cell', { name: description, exact: true }),
    });
  }

  private parseCurrency(value: string): number {
    const normalized = value.replace(/[^\d,.-]/g, '').replace(/,/g, '');
    const amount = Number(normalized);
    if (!Number.isFinite(amount)) {
      throw new Error(`Unable to parse expense currency value "${value}".`);
    }
    return amount;
  }

}
