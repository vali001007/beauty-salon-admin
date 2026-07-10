import { Injectable } from '@nestjs/common';

@Injectable()
export class BrainMemoryConsolidationService {
  summarizeEpisodicToSemantic(events: Array<{ subjectKey: string; content: Record<string, unknown> }>) {
    const weekendFullEvents = events.filter((event) => event.subjectKey === 'store.traffic.weekend_full').length;
    if (weekendFullEvents >= 3) {
      return [
        {
          subjectKey: 'store.profile.weekend_peak',
          content: { value: true, evidenceCount: weekendFullEvents },
          confidence: 0.85,
        },
      ];
    }

    return [];
  }
}
