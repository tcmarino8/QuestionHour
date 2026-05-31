import React, { useMemo, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Keyboard } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import './CardDeckSlider.css';

export default function CardDeckSlider({
  labels = ['Card 1', 'Card 2'],
  initialIndex = 0,
  onActiveIndexChange,
  children
}) {
  const slides = useMemo(() => React.Children.toArray(children), [children]);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [swiperInstance, setSwiperInstance] = useState(null);

  const goToSlide = (index) => {
    if (swiperInstance) {
      swiperInstance.slideTo(index);
    }
  };

  return (
    <div className="card-deck-shell">
      <div className="card-deck-tabs" role="tablist" aria-label="Visualization card selector">
        {labels.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={activeIndex === index}
            className={`card-deck-tab ${activeIndex === index ? 'is-active' : ''}`}
            onClick={() => goToSlide(index)}
          >
            {label}
          </button>
        ))}
      </div>

      <Swiper
        modules={[Pagination, Keyboard]}
        grabCursor={false}
        allowTouchMove={false}
        touchStartPreventDefault={false}
        preventClicks={false}
        preventClicksPropagation={false}
        noSwiping={true}
        noSwipingClass="swiper-no-swiping"
        keyboard={{ enabled: true }}
        pagination={{ clickable: true }}
        slidesPerView={1.06}
        spaceBetween={14}
        speed={360}
        breakpoints={{
          700: {
            slidesPerView: 1.14,
            spaceBetween: 16
          },
          1100: {
            slidesPerView: 1.2,
            spaceBetween: 18
          }
        }}
        onSwiper={(swiper) => {
          setSwiperInstance(swiper);
          setActiveIndex(swiper.activeIndex);
          if (onActiveIndexChange) {
            onActiveIndexChange(swiper.activeIndex);
          }
        }}
        onSlideChange={(swiper) => {
          setActiveIndex(swiper.activeIndex);
          if (onActiveIndexChange) {
            onActiveIndexChange(swiper.activeIndex);
          }
        }}
        className="card-deck-swiper"
      >
        {slides.map((slide, index) => (
          <SwiperSlide
            key={`deck-slide-${index}`}
            className="card-deck-slide"
            onClick={() => {
              if (activeIndex !== index) {
                goToSlide(index);
              }
            }}
          >
            <div
              className={`card-deck-slide-content swiper-no-swiping ${activeIndex === index ? 'is-active' : 'is-inactive'}`}
              aria-hidden={activeIndex !== index}
            >
              {slide}
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
