import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CardDeckSlider from './CardDeckSlider';

const mockSlideToLoop = jest.fn();
const mockSlideTo = jest.fn();
let mockOnSlideChange;

jest.mock('swiper/react', () => {
  const React = require('react');
  return {
    Swiper: ({ children, onSwiper, onSlideChange }) => {
      React.useEffect(() => {
        onSwiper({ activeIndex: 2, realIndex: 0, slideToLoop: mockSlideToLoop, slideTo: mockSlideTo });
      }, []);
      mockOnSlideChange = onSlideChange;
      return <div>{children}</div>;
    },
    SwiperSlide: ({ children, onClick }) => <div onClick={onClick}>{children}</div>
  };
}, { virtual: true });
jest.mock('swiper/modules', () => ({ Pagination: {}, Keyboard: {} }), { virtual: true });
jest.mock('swiper/css', () => ({}), { virtual: true });
jest.mock('swiper/css/pagination', () => ({}), { virtual: true });

test('looping uses logical slide indexes for interactive content and navigation', () => {
  const onActiveIndexChange = jest.fn();
  render(
    <CardDeckSlider labels={['Vote', 'Map', 'Network']} loop onActiveIndexChange={onActiveIndexChange}>
      <button>Vote here</button>
      <div>Map contents</div>
      <div>Network contents</div>
    </CardDeckSlider>
  );

  expect(screen.getByRole('button', { name: 'Vote here' }).parentElement).toHaveClass('is-active');
  expect(onActiveIndexChange).toHaveBeenLastCalledWith(0);
  fireEvent.click(screen.getByRole('tab', { name: 'Map' }));
  expect(mockSlideToLoop).toHaveBeenCalledWith(1);

  act(() => mockOnSlideChange({ activeIndex: 0, realIndex: 2 }));
  expect(screen.getByText('Network contents').parentElement).toHaveClass('is-active');
  expect(onActiveIndexChange).toHaveBeenLastCalledWith(2);
});
