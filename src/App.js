import React, { useState } from "react";
import axios from "axios";
import { Form, Button, AutoComplete, Card, Alert, Table, Spin } from "antd";
import Banner from "./Banner";
import "./styles/App.css";

require('dotenv').config();
POLYGON_KEY = process.env.POLYGON_KEY;

function App() {
  const [originalArray, setOriginalArray] = useState(Array(10).fill(''));
  const [error, setError] = useState('');
  const [showAlert, setShowAlert] = useState(false);
  const [hrpWeights, setHrpWeights] = useState(null);
  const [dataSource, setDataSource] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoUrls, setLogoUrls] = useState({}); 

  const handleChange = (index, value) => {
    const newOriginalArray = [...originalArray];
    newOriginalArray[index] = value;
    setOriginalArray(newOriginalArray);
  };

  const clearState = () => {
    setDataSource([]);
  };

  const handleSearch = async (value) => {
    setSearch(value);
    if (value) {
      try {
        const response = await axios.get(`https://ticker-2e1ica8b9.now.sh/keyword/${value}`);
        const dataArray = response.data.map((item) => ({ value: item.symbol }));
        setDataSource(dataArray);
      } catch (error) {
        console.error("Error:", error);
      }
    } else {
      setDataSource([]);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const filledInputs = originalArray.filter(val => val.trim() !== '');
    
    if (filledInputs.length <= 3) {
        setError("Please fill out at least 4 stock symbols.");
        setShowAlert(true);
        return;
    }
    
    setShowAlert(false);
    setError('');
    // setChartData(null);
    
    try {
      setLoading(true);
      const response = await axios.post('http://localhost:5000/double', {
          array: originalArray.map(val => val.trim()),
      });
      
      const hrpWeights = response.data.hrp_weights;
      setHrpWeights(hrpWeights);
  
      const logoPromises = originalArray.map(async symbol => {
        try {
          const response = await fetch(
            `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_KEY}`
          );
          const data = await response.json();
          const logoUrl = `${data?.results?.branding?.icon_url}?apiKey=${POLYGON_KEY}`;
          return { symbol, logoUrl };
        } catch (error) {
          console.error('Error fetching logo:', error);
          return { symbol, logoUrl: null };
        }
      });
      const logoResults = await Promise.all(logoPromises);
      const logoUrlMap = logoResults.reduce((acc, { symbol, logoUrl }) => {
        acc[symbol] = logoUrl;
        return acc;
      }, {});
      setLogoUrls(logoUrlMap);
  
    } catch (error) {
        console.error('Error:', error);
    } finally {
        setLoading(false);
    }
  };

  

  return (
    <div>
      <Banner></Banner>
      <div className="app-container">
        <div className="card-container">
          <Card
            title={<span style={{ color: 'rgba(84,58,183,1)' }}>Enter 10 Stock Symbols</span>}
            bordered={true}
            style={{
              width: 1000,
              boxShadow: '0 4px 8px rgba(84,58,183,1)',
            }}
          >
            <Form>
              {[...Array(10)].map((_, index) => (
                <div key={index} style={{ marginBottom: 16 }}>
                  <Form.Item label={`Stock ${index + 1}`} name={["stockSymbols", index]} rules={[{ required: false, message: "Please enter a stock symbol" }]}>
                    <AutoComplete
                      style={{ width: "90%" }}
                      value={search}
                      onChange={(value) => { handleSearch(value); handleChange(index, value); }}
                      onSelect={clearState}
                      dataSource={dataSource}
                      placeholder="Search Ticker"
                    />
                  </Form.Item>
                </div>
              ))}
              <Button
                htmlType="submit"
                style={{
                  boxShadow: "0 2px 4px purple",
                  transition: "box-shadow 0.8s",
                }}
                onClick={handleSubmit}
              >
                Optimize
              </Button>
            </Form>

            {showAlert && <Alert type="error" message={error} banner onClose={() => setShowAlert(false)} />}
            {loading && <div><Spin tip="Gathering Data..." size="large">
                <div className="content" />
              </Spin>
              <Alert
                  message="Thank You For Your Patience"
                  description="We are gathering data. This process may take up to 30 seconds. Please be patient."
                  type="info"
                  showIcon
                /></div>
            }

            {hrpWeights && (
              <div style={{ marginTop: '20px' }}>
                <h2>Hierarchical Risk Parity Weights</h2>
                <Table
                  dataSource={originalArray.filter(symbol => symbol.trim() !== '').map((ticker, index) => ({
                    key: `row${index}`,
                    ticker,
                    weight: hrpWeights[index],
                    logoUrl: logoUrls[ticker],
                  }))}
                  columns={[
                    {
                      title: 'Company Logo',
                      dataIndex: 'logoUrl',
                      key: 'logo',
                      render: logoUrl => <img src={logoUrl} alt="Company Logo" style={{ width: 50, height: 50 }} />,
                    },
                    {
                      title: 'Stock Ticker',
                      dataIndex: 'ticker',
                      key: 'ticker',
                    },
                    {
                      title: 'HRP Weight',
                      dataIndex: 'weight',
                      key: 'weight',
                      render: weight => `${(weight * 100).toFixed(1)}%`,
                    },
                  ]}
                />
              </div>
            )}

          </Card>
        </div>
      </div>

      

    </div>
  );
}

export default App;
