# News Integration Script for App.js

# Step 1: Add NewsPanel import
(Get-Content "src/App.js") -replace "import HistoryView from './components/HistoryView';", "import HistoryView from './components/HistoryView';
import NewsPanel from './components/NewsPanel';" | Set-Content "src/App.js"

# Step 2: Add news panel state variables
(Get-Content "src/App.js") -replace "const \[selectedMapStyle, setSelectedMapStyle\] = useState\('stamen_toner'\);", "const [selectedMapStyle, setSelectedMapStyle] = useState('stamen_toner');
  const [showNewsPanel, setShowNewsPanel] = useState(false);
  const [newsTopic, setNewsTopic] = useState('');
  const [newsBias, setNewsBias] = useState('');
  const [newsLocation, setNewsLocation] = useState('');" | Set-Content "src/App.js"

Write-Host "News integration completed!"
