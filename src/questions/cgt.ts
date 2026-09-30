/** M11 capital gains and crypto. Universal. */
import type { Question } from '../engine/types';
import { GROUPS, Q } from './ids';
import { all, any, eq, flatten, gt, includes, includesAny, money, multi, not, opt, percent, repeater, screening, single, text, yes, yesNoUnsure, date } from './shared';

const C = GROUPS.cgtEvent;
/** Ticks that create a CGT event of your own (a trust distribution is captured in Investments). */
const HAS_EVENT = includesAny(Q.cgt.events, ['shares', 'crypto', 'property', 'insurance', 'other']);

export const CGT_QUESTIONS: Question[] = flatten(
  ...screening(Q.cgt.events, 'cgt', 'Did any of these happen this year?', [
    opt('shares', 'I sold shares or ETF units', 'Any sale, even at a loss. Also a company takeover or share buy-back.'),
    opt('crypto', 'I sold, swapped or spent cryptocurrency', 'Every disposal counts, including swapping one coin for another, or paying for something with crypto.'),
    opt('property', 'I sold a property', 'Including your home if it was ever rented or used for business.'),
    opt('distribution', 'I received a capital gain distribution from a fund or trust', 'Enter the amounts in the Investments section; tick here so we do not miss it.'),
    opt('insurance', 'An asset was lost or destroyed and insurance paid out', 'An insurance payout for a lost asset can be a CGT event.'),
  ], {
    help: 'Capital gains are taxed as income in the year the sale contract is signed. Losses can only offset gains, so we need every event, not just the profitable ones.',
  }),
  repeater(Q.cgt.repeater, 'cgt', 'Your capital gains events', {
    groupId: C, itemLabel: 'Sale or disposal', addLabel: 'Add another sale or disposal', minItems: 1, labelFrom: Q.cgt.description,
  }, { showIf: HAS_EVENT, help: 'One entry per asset sold. For crypto, each sale or swap is its own entry; you may summarise from an exchange tax report.' }),
  single(Q.cgt.assetType, 'cgt', 'What kind of asset was it?', [
    opt('shares', 'Shares or ETF units'),
    opt('crypto', 'Cryptocurrency'),
    opt('property', 'Real estate'),
    opt('other', 'Something else', 'For example collectables, a business asset, or a lost asset with an insurance payout.'),
  ], { repeaterGroup: C, showIf: HAS_EVENT, feeds: ['cgt'] }),
  text(Q.cgt.description, 'cgt', 'Describe the asset (for example "300 BHP shares" or "0.5 BTC")', { repeaterGroup: C, showIf: HAS_EVENT, required: true, validation: [{ kind: 'maxLength', value: 200 }] }),
  date(Q.cgt.acquiredDate, 'cgt', 'On what date did you acquire it?', {
    repeaterGroup: C, showIf: HAS_EVENT, feeds: ['cgt'],
    help: 'The contract or purchase date. Assets held 12 months or more may get a 50% discount on the gain, so this date matters.',
  }),
  money(Q.cgt.costBase, 'cgt', 'What did it cost you in total, including incidental costs like brokerage?', {
    repeaterGroup: C, showIf: HAS_EVENT, feeds: ['cgt'], validation: [{ kind: 'min', value: 0 }],
    help: 'Purchase price plus brokerage, stamp duty, legal fees and selling costs. For crypto, the AUD value when you acquired it.',
  }),
  date(Q.cgt.disposedDate, 'cgt', 'On what date did you sell or dispose of it?', {
    repeaterGroup: C, showIf: HAS_EVENT, feeds: ['cgt'], validation: [{ kind: 'inFinancialYear' }],
    help: 'The contract date for property, the trade date for shares and crypto.',
  }),
  money(Q.cgt.proceeds, 'cgt', 'How much did you receive for it?', {
    repeaterGroup: C, showIf: HAS_EVENT, feeds: ['cgt'], validation: [{ kind: 'min', value: 0 }],
    help: 'The sale price before selling costs. For a crypto swap, the AUD value of what you received.',
  }),
  percent(Q.cgt.ownershipPct, 'cgt', 'What percentage of the asset did you own?', {
    repeaterGroup: C, showIf: HAS_EVENT, feeds: ['cgt'],
    help: 'Enter 100 if it was only yours, or your share if owned jointly.',
  }),
  single(Q.cgt.mainResidence, 'cgt', 'Was this property your main home?', [
    opt('yes', 'Yes, for the whole time I owned it', 'A home that was only ever your main residence is usually exempt.'),
    opt('no', 'No'),
    opt('part', 'For part of the time, or it was partly rented', 'Partial exemption; we route this to review.'),
  ], {
    repeaterGroup: C, showIf: all(HAS_EVENT, eq(Q.cgt.assetType, 'property')), feeds: ['cgt'],
    help: 'The main residence exemption can remove the gain, but it has many conditions. Anything other than a clear "yes" is reviewed.',
  }),
  yesNoUnsure(Q.cgt.priorLossesAny, 'cgt', 'Do you have net capital losses carried forward from earlier years?', {
    showIf: not(HAS_EVENT), required: false, feeds: ['cgt'],
    help: 'Unused capital losses stay available until you have a capital gain, even in years with no sales. We keep the balance so it is not lost.',
  }),
  money(Q.cgt.priorLosses, 'cgt', 'Do you have net capital losses carried forward from earlier years?', {
    showIf: any(HAS_EVENT, yes(Q.cgt.priorLossesAny)), feeds: ['cgt'], validation: [{ kind: 'min', value: 0 }],
    help: 'Shown on last year\'s notice of assessment or return. Losses are used before the discount. Enter 0 if none.',
  }),
  multi(Q.cgt.priorLossesOrigin, 'cgt', 'Where did those carried-forward capital losses come from?', [
    opt('spot_sales', 'Selling shares or crypto', 'Ordinary sales or swaps of shares, ETFs or coins.'),
    opt('derivatives', 'Futures, perpetuals, CFDs or other derivatives', 'Losses on leveraged or derivative trading.'),
    opt('property', 'Selling property'),
    opt('other', 'Something else'),
  ], {
    showIf: gt(Q.cgt.priorLosses, 0), required: false, feeds: ['cgt'],
    help: 'We keep the losses exactly as they were classified in earlier years. Knowing where they came from lets us flag a classification that may need checking.',
  }),
  text(Q.cgt.priorLossesCorrection, 'cgt', 'If these losses were reclassified by a tax agent or the ATO, describe the correction (optional)', {
    showIf: gt(Q.cgt.priorLosses, 0), required: false, validation: [{ kind: 'maxLength', value: 500 }],
    help: 'Include the evidence, for example "2024-25 amended by agent on 3 March: $4,000 reclassified as a business loss (amendment notice)". The balance above should already reflect any correction.',
  }),
  yesNoUnsure(Q.cgt.derivativesAny, 'cgt', 'Did you trade futures, perpetuals, CFDs, options or other derivatives this year (including crypto futures)?', {
    required: false, feeds: ['cgt'],
    help: 'Derivative trading is not treated like buying and selling coins or shares. Whether it is investing or a business decides where the result belongs.',
  }),
  single(Q.cgt.derivativesNature, 'cgt', 'How would you describe that derivatives trading?', [
    opt('investment', 'Occasional trading of my own money, not run as a business', 'We record the result for review; how it is taxed depends on the facts.'),
    opt('business', 'Regular, organised trading run like a business', 'Enter it once as a business activity (Business section), with its own expenses. It is not counted here.'),
  ], { showIf: yes(Q.cgt.derivativesAny), feeds: ['cgt'] }),
  money(Q.cgt.derivativesNet, 'cgt', 'What was your net result from derivatives this year? (a loss as a negative amount)', {
    showIf: eq(Q.cgt.derivativesNature, 'investment'), allowNegative: true, calc: { cgt: 'derivatives' }, feeds: ['cgt'],
    help: 'From the exchange\'s yearly report: realised profit less losses and fees. It is sent to review, never added automatically.',
  }),
  text(Q.cgt.platforms, 'cgt', 'Which exchanges or platforms did you use? (optional)', {
    showIf: any(includes(Q.cgt.events, 'crypto'), yes(Q.cgt.derivativesAny)), required: false, validation: [{ kind: 'maxLength', value: 200 }],
    help: 'For example "Binance, Bybit, CoinSpot". Helps match exchange reports and avoids entering the same trades twice.',
  }),
  single(Q.cgt.cryptoMethod, 'cgt', 'How did you work out the cost of each crypto unit you sold?', [
    opt('specific_id', 'I identified the specific units sold', 'You can trace which purchase each sale came from.'),
    opt('fifo', 'First in, first out (FIFO)', 'The earliest units bought are treated as sold first.'),
    opt('other', 'Another method, or an exchange tax report', 'For example a crypto tax tool\'s report. We note the method for review.'),
  ], { showIf: includes(Q.cgt.events, 'crypto'), feeds: ['cgt'], help: 'The method must be applied consistently. We never assume one for you.' }),
  yesNoUnsure('cgt.crypto_income.any', 'cgt', 'Did you receive any crypto from staking, airdrops, or as payment?', {
    showIf: includes(Q.cgt.events, 'crypto'), feeds: ['income'],
    help: 'Staking rewards, airdrops and crypto received as payment are ordinary income at their AUD value when received, not capital gains.',
  }),
  money(Q.cgt.cryptoIncome, 'cgt', 'What was the AUD value of the crypto income when you received it?', {
    showIf: yes('cgt.crypto_income.any'), income: { category: 'crypto_income', treatment: 'I' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
  }),
);
