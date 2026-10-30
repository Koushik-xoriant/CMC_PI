import { expect, Locator, Page, TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const mimeTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export class PendingTrayPage {
  private readonly uploadArea: Locator;

  constructor(
    private readonly page: Page,
    private readonly testInfo: TestInfo,
  ) {
    this.uploadArea = page.locator('#dragdrop-area');
  }

  async open(): Promise<void> {
    await this.page.goto('/pending_tray', { waitUntil: 'domcontentloaded' });
    // The legacy pending tray content loads well after the application shell.
    await expect(this.uploadArea).toBeVisible({ timeout: 120_000 });
  }

  async markReceiptUnprocessed(fileName: string): Promise<void> {
    // The tray opens filtered to unprocessed PDFs, so show every file and status
    // to find the receipt whatever state the previous run left it in.
    await this.selectFilter('filter_by_file_extension', 'PDF & Image');
    await this.selectFilter('filter_by_status', 'Show All');

    const receipt = this.page.locator('.documentCaptureEmail').filter({ hasText: fileName });
    await expect(receipt.first()).toBeVisible({ timeout: 30_000 });
    const receiptCount = await receipt.count();
    if (receiptCount !== 1) {
      throw new Error(
        `Expected one "${fileName}" in the pending tray but found ${receiptCount}; delete the extra copies.`,
      );
    }

    const status = receipt.locator('.documentCaptureEmail-status span');
    const initialStatus = (await status.innerText()).trim();
    if (initialStatus !== 'Unprocessed') {
      await receipt.locator('input.select-email').check();
      await this.page.locator('#markAsUnprocessed').click();
      await expect(status).toHaveText('Unprocessed', { timeout: 30_000 });
    }
    this.testInfo.annotations.push({
      type: 'pending-tray-reset',
      description: `"${fileName}" was ${initialStatus} and is now Unprocessed.`,
    });

    await this.selectFilter('filter_by_status', 'Show Unprocessed');
    await this.selectFilter('filter_by_file_extension', 'PDF Only');
  }

  private async selectFilter(selectId: string, option: string): Promise<void> {
    // The filters are select2 widgets layered over hidden native selects.
    await this.page.locator(`#s2id_${selectId} a`).click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
    await expect(this.page.locator(`#s2id_${selectId} .select2-chosen`)).toHaveText(option);
  }

  async uploadReceipt(sourceFile: string): Promise<string> {
    const extension = path.extname(sourceFile).toLowerCase();
    const mimeType = mimeTypes[extension];
    if (!mimeType) {
      throw new Error(`The pending tray only accepts PDF, JPEG and PNG files, not "${sourceFile}".`);
    }

    // A unique file name lets the test select its own attachment rather than any
    // attachment already waiting in the shared pending tray.
    const fileName = `automation-tray-${randomUUID().slice(0, 8)}${extension}`;
    // Clicking the upload area does not reliably open the file chooser, so the
    // file is dropped onto it instead.
    await this.uploadArea.drop({
      files: { name: fileName, mimeType, buffer: readFileSync(sourceFile) },
    });

    // Upload rows sit inside the page's layout table, so only match the row that
    // directly holds the upload status.
    const uploadRow = this.page
      .locator('tr:has(> #fileuploadstatusi)')
      .filter({ hasText: fileName });
    await expect(uploadRow).toContainText('Status: Complete', { timeout: 60_000 });
    this.testInfo.annotations.push({
      type: 'pending-tray-seed',
      description: `Uploaded ${fileName} to the pending tray before the test.`,
    });
    return fileName;
  }
}
