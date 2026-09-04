import React, { useState, useRef, useEffect } from 'react';
import { FiX, FiChevronDown } from 'react-icons/fi';
import './Select.css';

/**
 * Select Component - Dropdown selector
 * Renders custom dropdown with search capability
 */
export const Select = React.forwardRef(
  (
    {
      options = [],
      value = '',
      onChange = null,
      placeholder = 'Select...',
      disabled = false,
      searchable = true,
      clearable = false,
      error = false,
      helperText = '',
      className = '',
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef(null);

    const selectedOption = options.find((opt) => opt.value === value);
    const filteredOptions = searchable
      ? options.filter((opt) =>
          opt.label.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : options;

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (containerRef.current && !containerRef.current.contains(event.target)) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue) => {
      onChange?.({ target: { value: optionValue } });
      setIsOpen(false);
      setSearchTerm('');
    };

    const handleClear = (e) => {
      e.stopPropagation();
      onChange?.({ target: { value: '' } });
    };

    return (
      <div className={`select-wrapper ${className}`} ref={containerRef}>
        <div
          className={`select-trigger ${error ? 'select-error' : ''} ${disabled ? 'select-disabled' : ''} ${isOpen ? 'select-open' : ''}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          ref={ref}
        >
          <span className="select-value">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <div className="select-actions">
            {clearable && selectedOption && !disabled && (
              <button
                className="select-clear"
                onClick={handleClear}
                aria-label="Clear selection"
              >
                <FiX />
              </button>
            )}
            <span className={`select-arrow ${isOpen ? 'select-arrow-open' : ''}`}>
              <FiChevronDown />
            </span>
          </div>
        </div>

        {isOpen && (
          <div className="select-menu">
            {searchable && (
              <input
                type="text"
                className="select-search"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <div className="select-options">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`select-option ${
                      value === option.value ? 'select-option-selected' : ''
                    }`}
                    onClick={() => handleSelect(option.value)}
                  >
                    {option.label}
                  </div>
                ))
              ) : (
                <div className="select-no-options">No options found</div>
              )}
            </div>
          </div>
        )}

        {helperText && (
          <p className={`select-helper ${error ? 'select-helper-error' : ''}`}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;
