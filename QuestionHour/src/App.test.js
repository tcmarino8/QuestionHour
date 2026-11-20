import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { api } from './services/api';

jest.mock('./services/api', () => ({
  api: {
    getCurrentQuestion: jest.fn(),
    getLiveStack: jest.fn(),
    getCurrentQuestionResponses: jest.fn(),
    addResponse: jest.fn()
  }
}));
jest.mock('react-force-graph-3d', () => require('react').forwardRef(() => null));
jest.mock('react-leaflet', () => ({
  MapContainer: require('react').forwardRef(({ children }, ref) => <div ref={ref}>{children}</div>),
  TileLayer: () => null,
  CircleMarker: () => null,
  Popup: ({ children }) => <div>{children}</div>
}));
jest.mock('./components/CardDeckSlider', () => ({ children }) => <div>{children}</div>);

const question = { text: 'A current statement', theme: 'science_nature', aiGenerated: true };

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  api.getCurrentQuestion.mockResolvedValue(question);
  api.getLiveStack.mockResolvedValue({ layers: [] });
  api.getCurrentQuestionResponses.mockResolvedValue([]);
  api.addResponse.mockResolvedValue({});
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: jest.fn(success => success({ coords: { latitude: 40, longitude: -74 } })) }
  });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      address: { postcode: '10001' }
    })
  });
});

afterEach(() => {
  delete global.fetch;
});

test.each(['Agree', 'Disagree'])('selecting %s obtains location and submits a vote', async (choice) => {
  render(<App />);
  const button = await screen.findByRole('button', { name: choice });
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.getByText('AI-generated question')).toBeInTheDocument();
  fireEvent.click(button);

  await waitFor(() => expect(api.addResponse).toHaveBeenCalledTimes(1));
  expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(api.addResponse).toHaveBeenCalledWith(expect.objectContaining({
    question: question.text,
    response: choice.toLowerCase(),
    location: '10001',
    lat: expect.any(Number),
    lng: expect.any(Number)
  }));
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('https://nominatim.openstreetmap.org/reverse?'));
  expect(await screen.findByText(choice.toLowerCase(), { selector: 'b' })).toBeInTheDocument();
});

test('location failure is shown and allows retry without submitting a vote', async () => {
  navigator.geolocation.getCurrentPosition.mockImplementation((success, error) => error(new Error('Permission denied')));
  render(<App />);
  const button = await screen.findByRole('button', { name: 'Agree' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);

  expect(await screen.findByText(/check location permissions/i)).toBeInTheDocument();
  expect(api.addResponse).not.toHaveBeenCalled();
  expect(button).toBeEnabled();
});

test('returning from a historical day restores voting for the current question', async () => {
  api.getLiveStack.mockResolvedValue({
    layers: [{
      dateKey: '2000-01-01',
      displayQuestionText: 'An old statement',
      displayTheme: 'sports',
      responseCount: 1,
      responses: []
    }]
  });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /1 responses/i }));
  expect(screen.getByText(/Historical layer selected/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Today' }));
  expect(screen.getByRole('button', { name: 'Agree' })).toBeEnabled();
  expect(screen.getByText(question.text)).toBeInTheDocument();
});

test('a failed postal-code lookup does not submit a vote', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ error: 'Unable to geocode' }) });
  render(<App />);
  const button = await screen.findByRole('button', { name: 'Disagree' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(await screen.findByText(/could not get your location or postal code/i)).toBeInTheDocument();
  expect(api.addResponse).not.toHaveBeenCalled();
});

test('location obtained separately is reused when voting', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Get My Location' }));
  expect(await screen.findByText('Location found! You can now vote.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
  await waitFor(() => expect(api.addResponse).toHaveBeenCalledTimes(1));
  expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
});

test('a failed vote submission reports an error and allows retry', async () => {
  api.addResponse.mockRejectedValueOnce(new Error('Server unavailable'));
  render(<App />);
  const button = await screen.findByRole('button', { name: 'Agree' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(await screen.findByText(/could not record vote/i)).toBeInTheDocument();
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(api.addResponse).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('agree', { selector: 'b' })).toBeInTheDocument();
});

test('a pending location request cannot submit the same vote twice', async () => {
  let resolveLocation;
  navigator.geolocation.getCurrentPosition.mockImplementation(success => {
    resolveLocation = success;
  });
  render(<App />);
  const button = await screen.findByRole('button', { name: 'Agree' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  resolveLocation({ coords: { latitude: 40, longitude: -74 } });
  await waitFor(() => expect(api.addResponse).toHaveBeenCalledTimes(1));
});
