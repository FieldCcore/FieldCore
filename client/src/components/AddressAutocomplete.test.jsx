import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import AddressAutocomplete from './AddressAutocomplete';

vi.mock('../api', () => ({
  default: { get: vi.fn() },
}));
import api from '../api';

const PREDICTIONS = [
  {
    place_id: 'ChIJabc123',
    description: '8791 NW 21st St, Doral, FL 33172, USA',
    structured_formatting: {
      main_text:      '8791 NW 21st St',
      secondary_text: 'Doral, FL 33172, USA',
    },
  },
  {
    place_id: 'ChIJxyz789',
    description: '8791 NW 21st Ave, Miami, FL 33127, USA',
    structured_formatting: {
      main_text:      '8791 NW 21st Ave',
      secondary_text: 'Miami, FL 33127, USA',
    },
  },
];

const PLACE_DETAILS = {
  placeId:          'ChIJabc123',
  formattedAddress: '8791 NW 21st St, Doral, FL 33172, USA',
  addressLine1:     '8791 NW 21st St',
  addressLine2:     '',
  city:             'Doral',
  region:           'FL',
  postalCode:       '33172',
  country:          'United States',
  countryCode:      'US',
  latitude:         25.7951,
  longitude:        -80.3455,
};

function setup(props = {}) {
  const onChange = vi.fn();
  const onPlace  = vi.fn();
  const utils = render(
    <AddressAutocomplete
      value=""
      onChange={onChange}
      onPlace={onPlace}
      placeholder="Street address"
      {...props}
    />,
  );
  return { ...utils, onChange, onPlace };
}

// Advance the debounce timer and wait for the dropdown to appear.
// IMPORTANT: mock for autocomplete must be set BEFORE calling this helper.
async function triggerDebounce(input, text = '8791 NW 21st') {
  fireEvent.change(input, { target: { value: text } });
  await act(() => vi.advanceTimersByTimeAsync(310));
  await act(async () => {}); // flush resolved promise → React state update
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('AddressAutocomplete — rendering', () => {
  beforeEach(() => { api.get.mockReset(); });

  it('renders an input with the correct placeholder', () => {
    setup();
    expect(screen.getByPlaceholderText('Street address')).toBeInTheDocument();
  });

  it('renders no suggestion list when there are no predictions', () => {
    setup();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

// ── Debounced autocomplete fetch ──────────────────────────────────────────────

describe('AddressAutocomplete — autocomplete fetch (debounce)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.get.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fetch when input is shorter than 3 chars', async () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText('Street address'), { target: { value: 'ab' } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(api.get).not.toHaveBeenCalled();
  });

  it('fetches predictions after 300 ms debounce', async () => {
    api.get.mockResolvedValueOnce({ data: { predictions: PREDICTIONS } });
    setup();
    await triggerDebounce(screen.getByPlaceholderText('Street address'));
    expect(api.get).toHaveBeenCalledWith('/maps/autocomplete', {
      params: { input: '8791 NW 21st' },
    });
  });

  it('debounces rapid keystrokes to a single fetch', async () => {
    api.get.mockResolvedValue({ data: { predictions: [] } });
    setup();
    const input = screen.getByPlaceholderText('Street address');
    fireEvent.change(input, { target: { value: '879' } });
    fireEvent.change(input, { target: { value: '8791' } });
    fireEvent.change(input, { target: { value: '8791 NW' } });
    await act(() => vi.advanceTimersByTimeAsync(310));
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/maps/autocomplete', { params: { input: '8791 NW' } });
  });

  it('renders prediction items after a successful fetch', async () => {
    api.get.mockResolvedValueOnce({ data: { predictions: PREDICTIONS } });
    setup();
    // triggerDebounce flushes the debounce timer + promise resolution + React state update
    await triggerDebounce(screen.getByPlaceholderText('Street address'));
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('8791 NW 21st St')).toBeInTheDocument();
    expect(screen.getByText('8791 NW 21st Ave')).toBeInTheDocument();
  });

  it('hides the suggestion list when server returns empty predictions', async () => {
    api.get.mockResolvedValueOnce({ data: { predictions: [] } });
    setup();
    await triggerDebounce(screen.getByPlaceholderText('Street address'));
    expect(api.get).toHaveBeenCalled();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

// ── Suggestion selection + place details ──────────────────────────────────────
// Each test controls its own mock ordering (autocomplete first, place-details second).

describe('AddressAutocomplete — suggestion selection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.get.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onPlace with full address and coordinates after selection', async () => {
    // ORDERING: autocomplete first, place-details second
    api.get
      .mockResolvedValueOnce({ data: { predictions: PREDICTIONS } })
      .mockResolvedValueOnce({ data: PLACE_DETAILS });

    const { onPlace, onChange } = setup();
    const input = screen.getByPlaceholderText('Street address');

    await triggerDebounce(input);
    vi.useRealTimers(); // switch before waitFor polling

    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText('8791 NW 21st St'));

    expect(onChange).toHaveBeenCalledWith('8791 NW 21st St');

    await waitFor(() => {
      expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({
        street:      '8791 NW 21st St',
        city:        'Doral',
        state:       'FL',
        zip:         '33172',
        lat:         25.7951,
        lng:         -80.3455,
        place_id:    'ChIJabc123',
        country:     'United States',
        countryCode: 'US',
      }));
    });
  });

  it('fetches place-details using the selected prediction placeId', async () => {
    api.get
      .mockResolvedValueOnce({ data: { predictions: PREDICTIONS } })
      .mockResolvedValueOnce({ data: PLACE_DETAILS });

    setup();
    const input = screen.getByPlaceholderText('Street address');

    await triggerDebounce(input);
    vi.useRealTimers();

    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText('8791 NW 21st St'));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/maps/place-details', {
        params: { placeId: 'ChIJabc123' },
      });
    });
  });

  it('falls back to basic address data when place-details fails', async () => {
    api.get
      .mockResolvedValueOnce({ data: { predictions: PREDICTIONS } })
      .mockRejectedValueOnce(new Error('network error'));

    const { onPlace } = setup();
    const input = screen.getByPlaceholderText('Street address');

    await triggerDebounce(input);
    vi.useRealTimers();

    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText('8791 NW 21st St'));

    await waitFor(() => {
      expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({
        street:   '8791 NW 21st St',
        city:     'Doral',
        state:    'FL',
        zip:      '33172',
        lat:      null,
        lng:      null,
        place_id: 'ChIJabc123',
      }));
    });
  });

  it('closes the dropdown immediately after selection', async () => {
    api.get
      .mockResolvedValueOnce({ data: { predictions: PREDICTIONS } })
      .mockResolvedValueOnce({ data: PLACE_DETAILS });

    setup();
    const input = screen.getByPlaceholderText('Street address');

    await triggerDebounce(input);
    vi.useRealTimers();

    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText('8791 NW 21st St'));
    expect(screen.queryByRole('list')).toBeNull();
  });
});

// ── Manual entry fallback ─────────────────────────────────────────────────────

describe('AddressAutocomplete — manual entry', () => {
  beforeEach(() => { api.get.mockReset(); });

  it('calls onChange on every keystroke for manual typing', () => {
    api.get.mockResolvedValue({ data: { predictions: [] } });
    const { onChange } = setup();
    fireEvent.change(screen.getByPlaceholderText('Street address'), { target: { value: '123 Manual St' } });
    expect(onChange).toHaveBeenCalledWith('123 Manual St');
  });

  it('does not call onPlace when typing without selecting a suggestion', async () => {
    api.get.mockResolvedValue({ data: { predictions: [] } });
    const { onPlace } = setup();
    fireEvent.change(screen.getByPlaceholderText('Street address'), { target: { value: '123 Manual St' } });
    await new Promise(r => setTimeout(r, 50));
    expect(onPlace).not.toHaveBeenCalled();
  });
});

// ── Security: server key never in browser source ──────────────────────────────

describe('AddressAutocomplete.jsx — server key isolation (source)', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, './AddressAutocomplete.jsx'),
    'utf8',
  );

  it('does not reference GOOGLE_MAPS_SERVER_KEY', () => {
    expect(source).not.toContain('GOOGLE_MAPS_SERVER_KEY');
  });

  it('does not reference process.env', () => {
    expect(source).not.toContain('process.env');
  });

  it('does not call google.maps.places APIs directly', () => {
    expect(source).not.toContain('google.maps.places');
  });

  it('routes autocomplete through server proxy endpoint', () => {
    expect(source).toContain('/maps/autocomplete');
  });

  it('routes place detail lookups through server proxy endpoint', () => {
    expect(source).toContain('/maps/place-details');
  });
});
