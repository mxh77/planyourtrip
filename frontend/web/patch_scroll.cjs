const fs = require('fs');
const path = '/opt/planyourtrip/frontend/web/src/pages/RoadtripPage.jsx';
let src = fs.readFileSync(path, 'utf-8');

// 1. Replace the carousel div to add onScroll handler
// Find the carousel ref div and add onScroll + replace the onClick on cards
const carouselDivStart = '<div ref={carouselRef} className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-1"';
const carouselDivEnd = `>`;

const oldCarouselBlock = src.match(
  /<div ref=\{carouselRef\} className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-1"[^>]*>[\s\S]*?<\/div>/
);

if (oldCarouselBlock) {
  const fullCarousel = oldCarouselBlock[0];
  
  // Add onScroll to the carousel div
  const newCarouselDiv = fullCarousel
    .replace(
      '<div ref={carouselRef} className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-1"',
      '<div ref={carouselRef} onScroll={handleCarouselScroll} className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-1 snap-type-x mandatory"'
    );
  
  // Replace onClick on cards to also handle highlight but scroll detection will be primary
  // Remove the zoomKey increment from onClick (scroll handler will handle it)
  // But keep click for fallback
  src = src.replace(fullCarousel, newCarouselDiv);
} else {
  console.log('Could not find carousel div pattern');
}

// 2. Add handleCarouselScroll function after scrollCarousel
const scrollFuncEnd = `  const step = steps[selectedStepIndex];`;

const scrollHandlerCode = `  const handleCarouselScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    const cards = el.children;
    if (!cards.length) return;
    const centerX = el.scrollLeft + el.offsetWidth / 2;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - centerX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    if (closestIdx !== selectedStepIndex) {
      setSelectedStepIndex(closestIdx);
      setZoomKey(k => k + 1);
    }
  }, [selectedStepIndex]);`;

src = src.replace(scrollFuncEnd, scrollHandlerCode + '\n\n  ' + scrollFuncEnd);

fs.writeFileSync(path, src, 'utf-8');
console.log('RoadtripPage.jsx patched with carousel scroll detection');
console.log('Has handleCarouselScroll:', src.includes('handleCarouselScroll'));
console.log('Has snap-type:', src.includes('snap-type-x'));
