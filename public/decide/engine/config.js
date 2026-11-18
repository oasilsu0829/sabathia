// 엔진 기본값. "임시값"으로 표시된 항목은 실사용 기록으로 보정할 대상이다.
export const SUBJECTS = {
  math: { label: '수학', hue: 222 },
  korean: { label: '국어', hue: 350 },
  english: { label: '영어', hue: 160 },
  science: { label: '과학', hue: 35 },
  other: { label: '기타', hue: 260 },
};
export const SUBJECT_KEYS = Object.keys(SUBJECTS);

export const KINDS = {
  homework: '숙제',
  performance: '수행평가',
  review: '복습',
  exam_prep: '시험 공부',
  project: '프로젝트',
  other: '기타',
};
export const KIND_KEYS = Object.keys(KINDS);

export const FIXED_KINDS = {
  school: '학교',
  academy: '학원',
  commute: '이동',
  meal: '식사',
  other: '기타',
};

/**
 * 과목별 소요 시간 오차 범위 (임시값). [하한 비율, 상한 비율]
 * 수학: 문제 난이도에 따른 변동 / 국어: 개념 재확인으로 인한 큰 상방 변동
 * 영어·과학: 변동성 자료 부족 → 플래너 입력을 우선 신뢰(좁은 범위)
 */
export const DEFAULT_UNCERTAINTY = {
  math: [-0.1, 0.35],
  korean: [-0.1, 0.5],
  english: [-0.05, 0.15],
  science: [-0.05, 0.15],
  other: [-0.1, 0.25],
};

/** 필수 학원 업무의 과목 순서 (동점일 때만 사용) */
export const MANDATORY_RANK = ['math', 'science', 'korean', 'english', 'other'];
/** 자율적인 시험 공부의 과목 순서 (동점일 때만 사용) */
export const AUTONOMOUS_RANK = ['math', 'english', 'korean', 'science', 'other'];

export const DEFAULT_SETTINGS = {
  // 요일별 기상·취침 (0=일요일)
  days: [
    { wake: '08:30', sleep: '23:30' },
    { wake: '07:00', sleep: '23:30' },
    { wake: '07:00', sleep: '23:30' },
    { wake: '07:00', sleep: '23:30' },
    { wake: '07:00', sleep: '23:30' },
    { wake: '07:00', sleep: '23:30' },
    { wake: '08:30', sleep: '23:30' },
  ],
  delayMin: 30,
  examModeDays: 21,
  nearExamDays: 7,
  horizonDays: 7,
  minSlotMin: 15, // 학교 쉬는 시간(10분) 같은 자투리는 가용 시간으로 보지 않는다
  uncertainty: DEFAULT_UNCERTAINTY,
  exams: [],
  // 위험 판단 임계값 (보수적 기본값)
  thresholds: {
    reviewLossMin: 15, // 이 이상 복습 손실이 예상될 때만 지연 경고
    projectSlackMin: 30, // 프로젝트 카드를 띄우기 위한 오늘 최소 여유
  },
};
