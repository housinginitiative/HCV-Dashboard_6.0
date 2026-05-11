// Initialize chart variable
let gapChart = null;

// AMI threshold configuration
const AMI_THRESHOLDS = {
  30: { field: 'gap_under30', label: '<30% AMI' },
  50: { field: 'gap_under50', label: '<50% AMI' },
  80: { field: 'gap_under80', label: '<80% AMI' }
};

// Color palette (matching header gradient)
const COLORS = {
  30: '#667eea',
  50: '#764ba2',
  80: '#a55eea'
};

let raceGapData = [];
let currentThreshold = 30;

// Load and parse CSV data
async function loadRaceGapData() {
  try {
    const response = await fetch('data/voucher_gap_race_state.csv');
    const csvText = await response.text();
    
    // Parse CSV manually
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      
      if (values.length >= headers.length) {
        const row = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx];
        });
        raceGapData.push(row);
      }
    }
    
    console.log('Race gap data loaded:', raceGapData.length, 'rows');
    return true;
  } catch (error) {
    console.error('Error loading race gap data:', error);
    return false;
  }
}

// Helper function to parse CSV line with proper quote handling
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

// Prepare data for chart
function prepareChartData(threshold) {
  const config = AMI_THRESHOLDS[threshold];
  const field = config.field;
  
  // Sort by state name for consistent ordering
  const sortedData = [...raceGapData].sort((a, b) => {
    const stateA = a.States.split(' ')[a.States.split(' ').length - 1];
    const stateB = b.States.split(' ')[b.States.split(' ').length - 1];
    return stateA.localeCompare(stateB);
  });
  
  const labels = sortedData.map(row => {
    // Extract state abbreviation from the "State Name" format
    const parts = row.States.split(' ');
    return parts[parts.length - 1];
  });
  
  const data = sortedData.map(row => {
    const value = parseFloat(row[field]);
    return isNaN(value) ? 0 : value;
  });
  
  return { labels, data, sortedData };
}

// Create or update chart
function updateChart(threshold) {
  const { labels, data } = prepareChartData(threshold);
  const config = AMI_THRESHOLDS[threshold];
  
  if (!gapChart) {
    // Create new chart
    const ctx = document.getElementById('gapChart').getContext('2d');
    gapChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: `Voucher Gap: ${config.label}`,
            data: data,
            backgroundColor: COLORS[threshold],
            borderColor: COLORS[threshold],
            borderWidth: 1,
            borderRadius: 4,
            hoverBackgroundColor: 'rgba(102, 126, 234, 0.8)',
            borderSkipped: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y', // Horizontal bar chart
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            cornerRadius: 4,
            callbacks: {
              label: function(context) {
                const value = context.parsed.x;
                return `Gap: ${(value * 100).toFixed(1)}%`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 1,
            ticks: {
              callback: function(value) {
                return (value * 100).toFixed(0) + '%';
              }
            },
            title: {
              display: true,
              text: 'Voucher Gap (% of households)',
              font: {
                size: 12,
                weight: 'bold'
              }
            }
          },
          y: {
            title: {
              display: true,
              text: 'State',
              font: {
                size: 12,
                weight: 'bold'
              }
            }
          }
        }
      }
    });
  } else {
    // Update existing chart
    const config_updated = AMI_THRESHOLDS[threshold];
    gapChart.data.labels = labels;
    gapChart.data.datasets[0].data = data;
    gapChart.data.datasets[0].label = `Voucher Gap: ${config_updated.label}`;
    gapChart.data.datasets[0].backgroundColor = COLORS[threshold];
    gapChart.data.datasets[0].borderColor = COLORS[threshold];
    gapChart.update();
  }
}

// Toggle button event listeners
document.addEventListener('DOMContentLoaded', async function() {
  // Load data
  const dataLoaded = await loadRaceGapData();
  if (!dataLoaded) {
    document.getElementById('info').innerHTML = '<p style="color: red;">Error loading data. Please check the CSV file path.</p>';
    return;
  }
  
  // Initialize chart with default threshold
  updateChart(currentThreshold);
  
  // Setup toggle buttons
  const toggleButtons = document.querySelectorAll('#threshold-toggle .toggle-btn');
  toggleButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      // Update active state
      toggleButtons.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      // Update chart
      currentThreshold = parseInt(this.dataset.threshold);
      updateChart(currentThreshold);
    });
  });
});
