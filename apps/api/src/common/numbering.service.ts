import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { defaultFormat, formatDocumentNumber, type DocPrefixKey } from '@madda/shared';

@Injectable()
export class NumberingService {
  constructor(private prisma: PrismaService) {}

  private periodTag(reset: string, date: Date): string {
    if (reset === 'yearly') return String(date.getFullYear());
    if (reset === 'monthly') return `${date.getFullYear()}-${date.getMonth() + 1}`;
    return '';
  }

  /**
   * Next document number for a type.
   *
   * The counter is keyed per period, not per type. A single counter with a
   * period tag resets to 1 whenever the tag changes, which means numbering a
   * document dated *earlier* than the last one resets the sequence and reissues
   * a number that already exists. That is reachable in practice: entering an
   * employee with an old hire date, or backdating an invoice.
   *
   * A per-period key removes the ordering assumption entirely. A unique
   * constraint on the document code still backstops the one case this cannot
   * cover — a period that predates the sequence and was never counted — and a
   * violation surfaces loudly rather than issuing a duplicate.
   */
  async next(key: DocPrefixKey, date: Date = new Date()): Promise<string> {
    const fmt = defaultFormat(key);
    const tag = this.periodTag(fmt.reset, date);
    const counterKey = tag ? `${key}:${tag}` : key;

    return this.prisma.$transaction(async (tx) => {
      let seq = await tx.numberSequence.findUnique({ where: { key: counterKey } });
      if (!seq) {
        // Carry over the count from the pre-per-period row when it covers the
        // same period, so switching does not restart a live sequence.
        const legacy = tag ? await tx.numberSequence.findUnique({ where: { key } }) : null;
        const start = legacy && legacy.periodTag === tag ? legacy.current : 0;
        seq = await tx.numberSequence.create({
          data: {
            key: counterKey,
            prefix: fmt.prefix,
            includeYear: fmt.includeYear,
            padding: fmt.padding,
            reset: fmt.reset,
            current: start,
            periodTag: tag,
          },
        });
      }
      const updated = await tx.numberSequence.update({
        where: { key: counterKey },
        data: { current: seq.current + 1, periodTag: tag },
      });
      return formatDocumentNumber(
        {
          prefix: updated.prefix,
          includeYear: updated.includeYear,
          padding: updated.padding,
          reset: updated.reset as any,
        },
        updated.current,
        date,
      );
    });
  }
}
