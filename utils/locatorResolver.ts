import { Locator, TestInfo } from '@playwright/test';
import { label } from 'allure-js-commons';

export interface LocatorCandidate {
  name: string;
  locator: Locator;
}

export async function resolveLocator(
  testInfo: TestInfo,
  description: string,
  candidates: readonly LocatorCandidate[],
): Promise<Locator> {
  if (candidates.length === 0) {
    throw new Error(`No locator candidates were provided for "${description}".`);
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      await candidate.locator.waitFor({ state: 'visible', timeout: index === 0 ? 2_000 : 1_000 });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        continue;
      }
      throw error;
    }

    const count = await candidate.locator.count();
    const visibleLocators: Locator[] = [];
    for (let locatorIndex = 0; locatorIndex < count; locatorIndex += 1) {
      const locator = candidate.locator.nth(locatorIndex);
      if (await locator.isVisible()) {
        visibleLocators.push(locator);
      }
    }
    if (visibleLocators.length !== 1) {
      throw new Error(
        `The ${candidate.name} locator for "${description}" had ${visibleLocators.length} visible matches; expected one.`,
      );
    }

    if (index > 0) {
      const message = `${description} used fallback locator: ${candidate.name}`;
      testInfo.annotations.push({ type: 'locator-healed', description: message });
      await label('locator-healed', message);
    }
    return visibleLocators[0];
  }

  throw new Error(
    `Could not find "${description}" using its primary locator or ${candidates.length - 1} approved fallback(s).`,
  );
}
