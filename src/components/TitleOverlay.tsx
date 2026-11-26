import { useEffect, useMemo, useRef } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Flame,
  Lock,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  Shield,
} from 'lucide-react';
import { LEVEL_COUNT, LEVEL_METADATA, type LevelMetadata } from '../game/levels';
import { LevelMaterialIcon, StarSvg } from './BirdIcons';

interface TitleOverlayProps {
  selectedLevel: number;
  highestUnlockedIndex: number;
  levelRecords: Record<number, { bestScore: number; stars: number }>;
  isFullscreen: boolean;
  onSelectLevel: (idx: number) => void;
  onStart: (idx: number) => void;
  onToggleFullscreen: () => void;
}

interface ChapterGroup {
  chapter: string;
  items: { lvl: LevelMetadata; idx: number }[];
}

function SlingshotCrestEmblem({ className = 'w-16 h-16 sm:w-20 sm:h-20' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      className={`${className} shrink-0 drop-shadow-[0_8px_20px_rgba(0,0,0,0.65)]`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="crestRim" x1="12" y1="6" x2="84" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FCE4A6" />
          <stop offset="35%" stopColor="#C89342" />
          <stop offset="70%" stopColor="#6D4B21" />
          <stop offset="100%" stopColor="#E4B865" />
        </linearGradient>
        <linearGradient id="crestField" x1="48" y1="8" x2="48" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#261B15" />
          <stop offset="55%" stopColor="#14110F" />
          <stop offset="100%" stopColor="#090807" />
        </linearGradient>
        <linearGradient id="walnutWood" x1="30" y1="22" x2="66" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9A6035" />
          <stop offset="48%" stopColor="#66391C" />
          <stop offset="100%" stopColor="#3B1E0E" />
        </linearGradient>
        <linearGradient id="emberPlume" x1="48" y1="18" x2="54" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF0A8" />
          <stop offset="38%" stopColor="#FF7724" />
          <stop offset="100%" stopColor="#B81914" />
        </linearGradient>
      </defs>

      {/* Outer chamfered shield crest */}
      <polygon
        points="20,6 76,6 90,20 90,66 48,91 6,66 6,20"
        fill="url(#crestField)"
        stroke="url(#crestRim)"
        strokeWidth="2.8"
      />
      <polygon
        points="23,11 73,11 85,23 85,63 48,85 11,63 11,23"
        fill="none"
        stroke="rgba(252,228,166,0.22)"
        strokeWidth="1"
      />

      {/* Incandescent feather silhouette rising behind slingshot */}
      <path
        d="M48 15C55 24 58 34 54 46C51 54 46 57 44 61C41 53 40 43 43 32C44 25 46 20 48 15Z"
        fill="url(#emberPlume)"
        opacity="0.92"
      />
      <path
        d="M54 24C61 30 63 39 58 49C55 54 51 56 49 58C51 49 52 38 54 24Z"
        fill="#FF9F38"
        opacity="0.55"
      />

      {/* Carved Walnut Slingshot Y-Frame */}
      <path
        d="M48 77V51M48 51L29 25M48 51L67 25"
        stroke="#1C0E07"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M48 77V51M48 51L29 25M48 51L67 25"
        stroke="url(#walnutWood)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Wrought-iron yoke collar & brass ferrules */}
      <rect x="42.5" y="48" width="11" height="8" rx="1.5" fill="#2A2F36" stroke="#C89342" strokeWidth="1.2" />
      <rect x="25.5" y="22.5" width="7" height="5" rx="1.2" transform="rotate(-36 29 25)" fill="#D9A852" stroke="#2D1C09" strokeWidth="0.9" />
      <rect x="63.5" y="22.5" width="7" height="5" rx="1.2" transform="rotate(36 67 25)" fill="#D9A852" stroke="#2D1C09" strokeWidth="0.9" />

      {/* Taut leather elastic bands converging on central pouch */}
      <path
        d="M29 26L48 45L67 26"
        stroke="#E4B574"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="48" cy="45" r="5.2" fill="#2B1A12" stroke="#E6B868" strokeWidth="1.5" />
      <circle cx="48" cy="45" r="2.2" fill="#FF6E2B" />

      {/* Corner rivets */}
      <circle cx="21" cy="14" r="1.4" fill="#E4B865" />
      <circle cx="75" cy="14" r="1.4" fill="#E4B865" />
      <circle cx="48" cy="83" r="1.4" fill="#E4B865" />
    </svg>
  );
}

export function TitleOverlay({
  selectedLevel,
  highestUnlockedIndex,
  levelRecords,
  isFullscreen,
  onSelectLevel,
  onStart,
  onToggleFullscreen,
}: TitleOverlayProps) {
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  const chapterGroups = useMemo<ChapterGroup[]>(() => {
    const groups: ChapterGroup[] = [];
    for (let idx = 0; idx < LEVEL_METADATA.length; idx++) {
      const lvl = LEVEL_METADATA[idx];
      const last = groups[groups.length - 1];
      if (!last || last.chapter !== lvl.chapter) {
        groups.push({ chapter: lvl.chapter, items: [{ lvl, idx }] });
      } else {
        last.items.push({ lvl, idx });
      }
    }
    return groups;
  }, []);

  const totalStars = useMemo(() => {
    let sum = 0;
    for (const rec of Object.values(levelRecords)) {
      sum += rec.stars;
    }
    return sum;
  }, [levelRecords]);

  const completedCount = useMemo(
    () => Object.values(levelRecords).filter((r) => r.stars > 0).length,
    [levelRecords],
  );

  const unlockedCount = Math.min(LEVEL_COUNT, highestUnlockedIndex + 1);
  const selectedDef = LEVEL_METADATA[selectedLevel] ?? LEVEL_METADATA[0];

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedLevel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        if (selectedLevel <= highestUnlockedIndex) {
          onStart(selectedLevel);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [highestUnlockedIndex, onStart, selectedLevel]);

  return (
    <div className="fixed inset-0 pointer-events-none z-20 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Atmospheric left-edge gradient scrim on desktop & subtle edge protection on mobile */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none bg-gradient-to-b from-[#0b0908]/72 via-transparent to-[#0b0908]/88 lg:bg-gradient-to-r lg:from-[#0b0908]/82 lg:via-[#0b0908]/32 lg:to-transparent"
      />

      {/* Top Row: AAA Crest & Title Lockup (Left) + Minimalist Fullscreen HUD Toggle (Right) */}
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="pointer-events-auto flex items-center gap-3.5 sm:gap-5 max-w-xl">
          <SlingshotCrestEmblem className="w-14 h-14 sm:w-18 sm:h-18" />

          <div className="min-w-0">
            <div className="relative">
              {/* Engraved 3D relief shadow layer */}
              <span
                aria-hidden="true"
                className="font-display block text-[1.6rem] sm:text-4xl lg:text-[2.5rem] font-black tracking-[0.06em] leading-[1.02] text-[#170e09] translate-y-[2.5px] select-none"
              >
                PLUMA &amp; FURIA
              </span>
              {/* Brushed metallic-stone beveled main title */}
              <h1
                className="font-display absolute inset-0 text-[1.6rem] sm:text-4xl lg:text-[2.5rem] font-black tracking-[0.06em] leading-[1.02] bg-gradient-to-b from-[#fffaf0] via-[#efe1c8] to-[#a68f70] bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(0,0,0,0.75)]"
              >
                PLUMA &amp; FURIA
              </h1>
            </div>

            {/* Forged gold/bronze subtitle with metallic divider rules */}
            <div className="mt-1.5 flex items-center gap-2.5 sm:gap-3">
              <span className="h-[1px] w-6 sm:w-10 bg-gradient-to-r from-transparent via-[#d8a148] to-[#ffe196]" />
              <span className="font-display text-[11px] sm:text-sm font-extrabold uppercase tracking-[0.3em] bg-gradient-to-b from-[#ffe99e] via-[#dfa23c] to-[#9a6316] bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
                DEMOLICIÓN 3D
              </span>
              <span className="h-[1px] flex-1 max-w-[72px] bg-gradient-to-l from-transparent via-[#d8a148] to-[#ffe196]" />
            </div>
          </div>
        </div>

        {/* Top-Right Minimalist Translucent Fullscreen HUD Button */}
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleFullscreen();
          }}
          aria-label={isFullscreen ? 'Salir de pantalla completa [F]' : 'Pantalla completa [F]'}
          className="pointer-events-auto aaa-glass aaa-chamfer-sm w-11 h-11 flex items-center justify-center border border-[#d6a95c]/35 text-[#efe4cf] hover:border-[#f4cd78] hover:text-[#ffe39c] shadow-[inset_0_1px_0_rgba(255,235,190,0.16),0_6px_18px_rgba(0,0,0,0.5)] active:translate-y-[1px] transition-all cursor-pointer shrink-0"
        >
          {isFullscreen ? (
            <Minimize2 className="w-4.5 h-4.5 text-[#f6cb6b]" />
          ) : (
            <Maximize2 className="w-4.5 h-4.5" />
          )}
        </button>
      </div>

      {/* Main Campaign Menu Column: Left-aligned on lg+, compact scrollable bottom dock on mobile */}
      <div className="relative z-10 flex flex-col justify-end lg:justify-center lg:my-auto lg:w-[440px] max-w-full gap-3">
        {/* Campaign Header & Progression Summary */}
        <div
          data-testid="campaign-header"
          className="pointer-events-auto aaa-glass aaa-chamfer-sm px-3.5 py-2.5 border border-[#c89c54]/40 shadow-[inset_0_1px_0_rgba(255,235,195,0.16),0_8px_22px_rgba(0,0,0,0.5)] flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-[#f0c05e] shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#f2d394] truncate">
                Campaña de Asedio
              </div>
              <div className="text-[10px] text-[#b4a48c] truncate">
                Supera cada castillo en orden
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="text-right">
              <div
                data-testid="campaign-unlocked-count"
                className="font-mono-tac text-xs font-bold text-[#fff4dc]"
              >
                {unlockedCount}/{LEVEL_COUNT}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-[#9d8e77]">
                {completedCount > 0 ? `${completedCount} venc.` : 'Abiertos'}
              </div>
            </div>
            <div className="h-6 w-px bg-[#6e5a3e]/55" />
            <div className="flex items-center gap-1">
              <StarSvg filled={totalStars > 0} size={15} />
              <span className="font-mono-tac text-xs font-bold text-[#f6cb6b]">
                {totalStars}/{LEVEL_COUNT * 3}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable 18-Level Sequential Campaign List */}
        <div
          data-testid="campaign-level-list"
          className="pointer-events-auto max-h-[34vh] sm:max-h-[42vh] lg:max-h-[50vh] overflow-y-auto pr-1.5 space-y-3 scrollbar-thin"
          role="group"
          aria-label="Seleccionar nivel de campaña"
        >
          {chapterGroups.map((group) => {
            const chapterCompleted = group.items.filter(({ lvl }) => (levelRecords[lvl.id]?.stars ?? 0) > 0).length;
            const chapterUnlocked = group.items.some(({ idx }) => idx <= highestUnlockedIndex);

            return (
              <div key={group.chapter} className="space-y-1.5">
                <div className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 bg-[#120e0b]/92 backdrop-blur-sm border-b border-[#8c7048]/35">
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-[0.22em] ${
                      chapterUnlocked ? 'text-[#e8be6c]' : 'text-[#756a5b]'
                    }`}
                  >
                    {group.chapter}
                  </span>
                  <span className="font-mono-tac text-[10px] text-[#a7977e]">
                    {chapterCompleted}/{group.items.length}
                  </span>
                </div>

                {group.items.map(({ lvl, idx }) => {
                  const unlocked = idx <= highestUnlockedIndex;
                  const active = idx === selectedLevel && unlocked;
                  const record = levelRecords[lvl.id];
                  const isCompleted = Boolean(record && record.stars > 0);
                  const isFrontier = idx === highestUnlockedIndex && !isCompleted;
                  const levelNum = String(lvl.id).padStart(2, '0');

                  return (
                    <button
                      key={lvl.id}
                      ref={active ? activeItemRef : null}
                      type="button"
                      disabled={!unlocked}
                      aria-disabled={!unlocked}
                      aria-pressed={active}
                      data-testid={`level-card-${lvl.id}`}
                      data-locked={unlocked ? 'false' : 'true'}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        if (unlocked) onSelectLevel(idx);
                      }}
                      className={`aaa-chamfer group relative w-full text-left px-3 py-2 sm:px-3.5 sm:py-2.5 flex items-center gap-2.5 sm:gap-3 transition-all duration-150 border ${
                        !unlocked
                          ? 'bg-[#12100e]/86 border-[#4c4134]/55 opacity-80 cursor-not-allowed'
                          : active
                            ? 'aaa-glass aaa-card-sheen border-[#f0bd5e]/75 lg:translate-x-1.5 shadow-[inset_0_1px_0_rgba(255,234,175,0.22),0_0_20px_rgba(232,162,48,0.22),0_8px_20px_rgba(0,0,0,0.55)] cursor-pointer active:translate-y-[1px]'
                            : 'aaa-glass border-[#8f7958]/30 hover:border-[#d6a95c]/60 hover:lg:translate-x-0.5 shadow-[inset_0_1px_0_rgba(255,240,210,0.08),0_5px_14px_rgba(0,0,0,0.42)] cursor-pointer active:translate-y-[1px]'
                      }`}
                    >
                      {/* Warm amber indicator bar on active card */}
                      <span
                        aria-hidden="true"
                        className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] transition-opacity duration-150 ${
                          active
                            ? 'bg-gradient-to-b from-[#ffe79c] via-[#efa52c] to-[#9b550c] shadow-[0_0_10px_rgba(246,184,65,0.85)] opacity-100'
                            : 'bg-[#7d684a]/40 opacity-0 group-hover:opacity-60'
                        }`}
                      />

                      {/* Emblem or Lock badge */}
                      <span
                        className={`w-8 h-8 sm:w-9 sm:h-9 aaa-chamfer-sm shrink-0 flex items-center justify-center border transition-colors ${
                          !unlocked
                            ? 'bg-[#110f0d]/90 border-[#3f372d]/60 text-[#726758]'
                            : active
                              ? 'bg-[#2a1d11]/90 border-[#f0bd5e]/60'
                              : 'bg-[#171310]/85 border-[#6c5b43]/35 group-hover:border-[#b89254]/55'
                        }`}
                      >
                        {unlocked ? (
                          <LevelMaterialIcon levelIndex={idx} active={active} />
                        ) : (
                          <Lock className="w-4 h-4 text-[#7c7060]" />
                        )}
                      </span>

                      {/* Level title & status */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono-tac text-[10px] sm:text-[11px] font-bold ${
                              !unlocked
                                ? 'text-[#6c6255]'
                                : active
                                  ? 'text-[#f6cb6b]'
                                  : 'text-[#9e8d76]'
                            }`}
                          >
                            {levelNum}
                          </span>
                          <span
                            className={`text-xs sm:text-[14px] font-extrabold tracking-wide truncate ${
                              !unlocked
                                ? 'text-[#9e9180]'
                                : active
                                  ? 'text-[#fff7e6]'
                                  : 'text-[#dcd0be] group-hover:text-[#fff4df]'
                            }`}
                          >
                            {lvl.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] sm:text-[11px] truncate">
                          {!unlocked ? (
                            <span className="text-[#877a6a] truncate">
                              Bloqueado · Completa Nivel {lvl.id - 1}
                            </span>
                          ) : (
                            <>
                              <span className={active ? 'text-[#e5bf79]' : 'text-[#a99982]'}>
                                {lvl.materialLabel}
                              </span>
                              <span aria-hidden="true" className="text-[#665744]">
                                ·
                              </span>
                              <span className="text-[#a99982]">{lvl.pigCount} obj.</span>
                              {isCompleted && record && (
                                <>
                                  <span aria-hidden="true" className="text-[#665744]">
                                    ·
                                  </span>
                                  <span className="font-mono-tac text-[#9fe07d]">
                                    {record.bestScore.toLocaleString('es-ES')}
                                  </span>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right indicator: stars, frontier tag, or lock */}
                      <div className="shrink-0 flex items-center gap-1">
                        {isCompleted && record ? (
                          <div className="flex items-center gap-0.5" aria-label={`${record.stars} estrellas`}>
                            {[1, 2, 3].map((s) => (
                              <StarSvg key={s} filled={record.stars >= s} size={13} />
                            ))}
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#88db67] ml-0.5" />
                          </div>
                        ) : isFrontier ? (
                          <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider bg-[#3a260f]/90 border border-[#e6b355]/60 text-[#ffd985]">
                            Actual
                          </span>
                        ) : !unlocked ? (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[#665d51]">
                            N{lvl.id - 1}
                          </span>
                        ) : (
                          <ChevronRight
                            className={`w-4 h-4 transition-transform duration-150 ${
                              active
                                ? 'text-[#f6cb6b] translate-x-0.5'
                                : 'text-[#6e5f4b] group-hover:text-[#c9a96d]'
                            }`}
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Forged Crimson-to-Ember Primary CTA */}
        <button
          type="button"
          data-start="true"
          onClick={(e) => {
            e.currentTarget.blur();
            onStart(selectedLevel);
          }}
          className="pointer-events-auto aaa-chamfer relative overflow-hidden group w-full px-6 py-3.5 sm:py-4 bg-gradient-to-b from-[#d9392b] via-[#9e1713] to-[#5a0808] hover:from-[#eb4535] hover:via-[#b81d18] active:translate-y-[2px] border border-[#f5c870]/80 border-b-[3px] border-b-[#2c0303] shadow-[inset_0_1.5px_0_rgba(255,232,185,0.45),0_12px_30px_rgba(180,28,22,0.52),0_4px_12px_rgba(0,0,0,0.6)] transition-all cursor-pointer flex items-center justify-center gap-3"
        >
          {/* Periodic metallic sheen sweep */}
          <span
            aria-hidden="true"
            className="aaa-sheen-bar pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-transparent via-[#fff2c8]/55 to-transparent"
          />

          <Flame className="w-5 h-5 text-[#ffd273] shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
          <span className="font-display text-base sm:text-lg font-black tracking-[0.14em] uppercase text-[#fff9ed] [text-shadow:0_2px_4px_rgba(0,0,0,0.65)]">
            Jugar Nivel {selectedDef.id}
          </span>
        </button>

        {/* Mobile compact hint inside bottom dock */}
        <div className="flex sm:hidden items-center justify-center gap-2 text-[11px] font-medium text-[#cfc1aa]">
          <MoveHorizontal className="w-3.5 h-3.5 text-[#f0be64] shrink-0" />
          <span>Arrastrar para apuntar · Lanza también en cámara libre</span>
        </div>
      </div>

      {/* Desktop/Tablet Bottom Tactical Control Strip */}
      <div className="relative z-10 hidden sm:flex justify-center">
        <div className="aaa-glass aaa-chamfer-sm pointer-events-auto inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-4 py-2 border border-[#b78f4e]/30 shadow-[inset_0_1px_0_rgba(255,236,195,0.12),0_8px_24px_rgba(0,0,0,0.55)] text-xs text-[#dfd3bf]">
          <span className="inline-flex items-center gap-1.5">
            <MoveHorizontal className="w-3.5 h-3.5 text-[#f2c165]" />
            <span>Arrastrar para apuntar y tensar</span>
          </span>
          <span className="h-3 w-px bg-[#756146]/55" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5">
            <kbd className="aaa-kbd">ESPACIO</kbd>
            <span>Habilidad en vuelo</span>
          </span>
          <span className="h-3 w-px bg-[#756146]/55" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5">
            <kbd className="aaa-kbd">C</kbd>
            <span>Cámara libre (con disparo activo)</span>
          </span>
          <span className="h-3 w-px bg-[#756146]/55" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5">
            <kbd className="aaa-kbd">F</kbd>
            <span>Pantalla completa</span>
          </span>
        </div>
      </div>
    </div>
  );
}
