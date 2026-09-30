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

  async next(key: DocPrefixKey, date: Date = new Date()): Promise<string> {
    const fmt = defaultFormat(key);
    const tag = this.periodTag(fmt.reset, date);

    return this.prisma.$transaction(async (tx) => {
      let seq = await tx.numberSequence.findUnique({ where: { key } });
      if (!seq) {
        seq = await tx.numberSequence.create({
          data: {
            key,
            prefix: fmt.prefix,
            includeYear: fmt.includeYear,
            padding: fmt.padding,
            reset: fmt.reset,
            current: 0,
            periodTag: tag,
          },
        });
      }
      const restart = seq.reset !== 'never' && seq.periodTag !== tag;
      const nextVal = restart ? 1 : seq.current + 1;
      const updated = await tx.numberSequence.update({
        where: { key },
        data: { current: nextVal, periodTag: tag },
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
