import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

// AddressAutocomplete: simple input that calls onChange and exposes a "select place" test helper
vi.mock('../AddressAutocomplete', () => ({
  default: ({ value, onChange, onPlace, placeholder }) => (
    <div>
      <input
        placeholder={placeholder || 'Street address'}
        value={value || ''}
        onChange={e => onChange && onChange(e.target.value)}
        data-testid="address-autocomplete-input"
      />
      <button
        data-testid="simulate-place-select"
        type="button"
        onClick={() => onPlace && onPlace({
          street: '789 Oak Ave',
          city:   'Fort Lauderdale',
          state:  'FL',
          zip:    '33301',
          lat:    26.12,
          lng:    -80.14,
          place_id: 'ChIJtest123',
        })}
      >
        Select Place
      </button>
    </div>
  ),
}));

import api from '../../api';
import ClientLocationField from '../ClientLocationField';

const LOC_A = {
  id: 'loc-a', label: 'Home', address: '100 Main St', city: 'Boca Raton',
  state: 'FL', zip: '33431', lat: 26.36, lng: -80.12, is_primary: true, access_instructions: null,
};
const LOC_B = {
  id: 'loc-b', label: 'Office', address: '200 Pine Ave', city: 'Miami',
  state: 'FL', zip: '33101', lat: 25.77, lng: -80.19, is_primary: false, access_instructions: 'Gate code 1234',
};

function setup(props = {}) {
  const defaults = {
    clientId:        null,
    locationId:      null,
    address:         '',
    onSelect:        vi.fn(),
    onAddressChange: vi.fn(),
  };
  return render(<ClientLocationField {...defaults} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── No client (bare autocomplete) ─────────────────────────────────────────────

describe('ClientLocationField — no clientId', () => {
  it('renders bare AddressAutocomplete with no client', () => {
    setup({ clientId: null });
    expect(screen.getByTestId('address-autocomplete-input')).toBeInTheDocument();
    expect(screen.queryByTestId('location-dropdown')).toBeNull();
  });

  it('calls onAddressChange when typing', () => {
    const onAddressChange = vi.fn();
    setup({ clientId: null, onAddressChange });
    fireEvent.change(screen.getByTestId('address-autocomplete-input'), { target: { value: '5 Elm St' } });
    expect(onAddressChange).toHaveBeenCalledWith('5 Elm St');
  });

  it('calls onSelect with structured data when place is selected', () => {
    const onSelect = vi.fn();
    setup({ clientId: null, onSelect });
    fireEvent.click(screen.getByTestId('simulate-place-select'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      location_id: null,
      address:     '789 Oak Ave',
      city:        'Fort Lauderdale',
      state:       'FL',
      zip:         '33301',
    }));
  });
});

// ── With client — auto-load and auto-select primary ──────────────────────────

describe('ClientLocationField — clientId provided, locations exist', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: [LOC_A, LOC_B] });
  });

  it('loads locations for the client', async () => {
    setup({ clientId: 'c-111' });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/clients/c-111/locations');
    });
  });

  it('renders location dropdown after load', async () => {
    setup({ clientId: 'c-111' });
    await waitFor(() => expect(screen.getByTestId('location-dropdown')).toBeInTheDocument());
  });

  it('auto-selects primary location when nothing selected', async () => {
    const onSelect = vi.fn();
    setup({ clientId: 'c-111', locationId: null, address: '', onSelect });
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
        location_id: 'loc-a',
        address:     '100 Main St',
      }));
    });
  });

  it('does not auto-select when locationId already set', async () => {
    const onSelect = vi.fn();
    setup({ clientId: 'c-111', locationId: 'loc-b', address: '', onSelect });
    await waitFor(() => expect(screen.getByTestId('location-dropdown')).toBeInTheDocument());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not auto-select when address already typed', async () => {
    const onSelect = vi.fn();
    setup({ clientId: 'c-111', locationId: null, address: 'already typed', onSelect });
    await waitFor(() => expect(screen.getByTestId('location-dropdown')).toBeInTheDocument());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows location options in dropdown', async () => {
    setup({ clientId: 'c-111' });
    await waitFor(() => expect(screen.getByTestId('location-dropdown')).toBeInTheDocument());
    expect(screen.getByText(/Home.*100 Main St/)).toBeInTheDocument();
    expect(screen.getByText(/Office.*200 Pine Ave/)).toBeInTheDocument();
  });

  it('shows "+ Add Location…" option in dropdown', async () => {
    setup({ clientId: 'c-111' });
    await waitFor(() => expect(screen.getByTestId('location-dropdown')).toBeInTheDocument());
    expect(screen.getByText('+ Add Location…')).toBeInTheDocument();
  });

  it('calls onSelect when a dropdown option is chosen', async () => {
    const onSelect = vi.fn();
    setup({ clientId: 'c-111', onSelect });
    await waitFor(() => expect(screen.getByTestId('location-dropdown')).toBeInTheDocument());
    onSelect.mockClear();
    fireEvent.change(screen.getByTestId('location-dropdown'), { target: { value: 'loc-b' } });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      location_id: 'loc-b',
      address:     '200 Pine Ave',
      city:        'Miami',
    }));
  });

  it('shows access instructions for selected location', async () => {
    setup({ clientId: 'c-111', locationId: 'loc-b' });
    await waitFor(() => expect(screen.getByTestId('location-dropdown')).toBeInTheDocument());
    expect(screen.getByText('Gate code 1234')).toBeInTheDocument();
  });
});

// ── With client — no locations ────────────────────────────────────────────────

describe('ClientLocationField — clientId provided, no locations', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: [] });
  });

  it('renders bare AddressAutocomplete when no locations', async () => {
    setup({ clientId: 'c-222' });
    await waitFor(() => expect(screen.getByTestId('address-autocomplete-input')).toBeInTheDocument());
    expect(screen.queryByTestId('location-dropdown')).toBeNull();
  });

  it('shows "Save location to client" link when no locations', async () => {
    setup({ clientId: 'c-222' });
    await waitFor(() => expect(screen.getByTestId('add-location-link')).toBeInTheDocument());
  });

  it('opens AddLocationForm when add-location-link is clicked', async () => {
    setup({ clientId: 'c-222' });
    await waitFor(() => expect(screen.getByTestId('add-location-link')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-location-link'));
    expect(screen.getByText(/Add Service Location/i)).toBeInTheDocument();
  });
});

// ── AddLocationForm — inline add ──────────────────────────────────────────────

describe('ClientLocationField — AddLocationForm', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValue({
      data: { id: 'loc-new', label: 'Home', address: '789 Oak Ave', city: 'Fort Lauderdale', state: 'FL', zip: '33301', is_primary: true },
    });
  });

  async function openAddForm(props = {}) {
    const result = setup({ clientId: 'c-333', ...props });
    await waitFor(() => expect(screen.getByTestId('add-location-link')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-location-link'));
    return result;
  }

  it('shows label chip selector', async () => {
    await openAddForm();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Office')).toBeInTheDocument();
  });

  it('shows "Save to Client" button by default', async () => {
    await openAddForm();
    expect(screen.getByTestId('save-to-client-btn')).toBeInTheDocument();
  });

  it('shows "Use for This Job Only" button', async () => {
    await openAddForm();
    expect(screen.getByTestId('temp-location-btn')).toBeInTheDocument();
  });

  it('saves to client when "Save to Client" selected and address entered', async () => {
    const onSelect = vi.fn();
    await openAddForm({ onSelect });
    // Simulate place selection to fill address
    fireEvent.click(screen.getByTestId('simulate-place-select'));
    fireEvent.click(screen.getByTestId('add-location-save-btn'));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/clients/c-333/locations',
        expect.objectContaining({ address: '789 Oak Ave' })
      );
    });
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ location_id: 'loc-new' }));
    });
  });

  it('uses temp location without API call when "Use for This Job Only" selected', async () => {
    const onSelect = vi.fn();
    await openAddForm({ onSelect });
    fireEvent.click(screen.getByTestId('temp-location-btn'));
    fireEvent.click(screen.getByTestId('simulate-place-select'));
    fireEvent.click(screen.getByTestId('add-location-save-btn'));
    await waitFor(() => {
      expect(api.post).not.toHaveBeenCalled();
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
        location_id: null,
        address:     '789 Oak Ave',
      }));
    });
  });

  it('closes form when Cancel is clicked', async () => {
    await openAddForm();
    expect(screen.getByText(/Add Service Location/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByText(/Add Service Location/i)).toBeNull();
    });
  });

  it('save button disabled when address is empty', async () => {
    await openAddForm();
    const saveBtn = screen.getByTestId('add-location-save-btn');
    expect(saveBtn).toBeDisabled();
  });
});

// ── Dropdown → "+ Add Location…" ─────────────────────────────────────────────

describe('ClientLocationField — add from dropdown when locations exist', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: [LOC_A] });
  });

  it('shows AddLocationForm when "+ Add Location…" is chosen from dropdown', async () => {
    setup({ clientId: 'c-444' });
    await waitFor(() => expect(screen.getByTestId('location-dropdown')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('location-dropdown'), { target: { value: '__add__' } });
    expect(screen.getByText(/Add Service Location/i)).toBeInTheDocument();
  });
});
