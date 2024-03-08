from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from flask.helpers import send_from_directory
import pandas as pd
import requests
import matplotlib.pyplot as mpl
import scipy.cluster.hierarchy as sch
import random
import numpy as np
import matplotlib
import os
from dotenv import load_dotenv

load_dotenv()
matplotlib.use('Agg')  # Use the 'Agg' backend which is not interactive
FMP_KEY = os.getenv('FMP_KEY')
app = Flask(__name__, static_folder='/build', static_url_path='/')
CORS(app)

@app.route('/')
@cross_origin
def index():
    return app.send_static_file('index.html')


def calculate_monthly_returns(symbol):
    url = f'https://financialmodelingprep.com/api/v3/historical-price-full/{symbol}?apikey={FMP_KEY}'
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        if 'historical' not in data:
            print(f"No historical data available for {symbol}.")
            return pd.DataFrame()

        historical_data = data['historical']
        
        monthly_data = [entry for entry in historical_data if entry['date'].endswith('-01')]
        
        if len(monthly_data) < 2:
            print(f"Not enough monthly data available for {symbol} to calculate returns.")
            return pd.DataFrame()

        opening_prices = [entry['open'] for entry in monthly_data]
        
        monthly_returns = [(current_price - previous_price) / previous_price 
                           for current_price, previous_price in zip(opening_prices[1:], opening_prices[:-1])]
        
        df = pd.DataFrame({f"{symbol}_Monthly_Return": monthly_returns})
        return df
    
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data for {symbol}: {e}")
        return pd.DataFrame()

@app.route('/double', methods=['POST'])
@cross_origin()
def double_array():
    data = request.json
    input_array = data.get('array', [])
    cleaned_array = [s for s in input_array if s.strip()]
    
    dataframes = [calculate_monthly_returns(symbol) for symbol in cleaned_array if not calculate_monthly_returns(symbol).empty]

    if dataframes:
        merged_df = pd.concat(dataframes, axis=1)
        merged_df.dropna(inplace=True)

        def getIVP(cov, **kargs):
            ivp = 1. / np.diag(cov)
            ivp /= ivp.sum()
            return ivp

        def getClusterVar(cov, cItems):
            cov_ = cov.loc[cItems, cItems]
            w_ = getIVP(cov_).reshape(-1, 1)
            cVar = np.dot(np.dot(w_.T, cov_), w_)[0, 0]
            return cVar

        def getQuasiDiag(link):
            link = link.astype(int)
            sortIx = pd.Series([link[-1, 0], link[-1, 1]])
            numItems = link[-1, 3]
            while sortIx.max() >= numItems:
                sortIx.index = range(0, sortIx.shape[0] * 2, 2)
                df0 = sortIx[sortIx >= numItems]
                i = df0.index
                j = df0.values - numItems
                sortIx[i] = link[j, 0]
                df0 = pd.Series(link[j, 1], index=i + 1)
                sortIx = pd.concat([sortIx, df0])
                sortIx = sortIx.sort_index()
                sortIx.index = range(sortIx.shape[0])
            return sortIx.tolist()

        def getRecBipart(cov, sortIx):
            w = pd.Series(1, index=sortIx)
            cItems = [sortIx]
            while len(cItems) > 0:
                cItems = [i[j:k] for i in cItems for j, k in ((0, len(i) // 2), (len(i) // 2, len(i))) if len(i) > 1]
                for i in range(0, len(cItems), 2):
                    cItems0 = cItems[i]
                    cItems1 = cItems[i + 1]
                    cVar0 = getClusterVar(cov, cItems0)
                    cVar1 = getClusterVar(cov, cItems1)
                    alpha = 1 - cVar0 / (cVar0 + cVar1)
                    w[cItems0] *= alpha
                    w[cItems1] *= 1 - alpha
            return w

        def correlDist(corr):
            dist = ((1 - corr) / 2.)**.5
            return dist

        def plotCorrMatrix(path, corr, labels=None):
            if labels is None:
                labels = []
            mpl.pcolor(corr)
            mpl.colorbar()
            mpl.yticks(np.arange(.5, corr.shape[0] + .5), labels)
            mpl.xticks(np.arange(.5, corr.shape[0] + .5), labels)
            mpl.savefig(path)
            mpl.clf()
            mpl.close()
            return

        data = merged_df
        nObs, size0, size1, sigma1 = len(data), 5, 5, .25
        cols = [random.randint(0, size0 - 1) for i in range(size1)]
        cov, corr = data.cov(), data.corr()
        plotCorrMatrix('HRP3_corr0.png', corr, labels=corr.columns)
        dist = correlDist(corr)
        link = sch.linkage(dist, 'single')
        sortIx = getQuasiDiag(link)
        sortIx = corr.index[sortIx].tolist()
        df0 = corr.loc[sortIx, sortIx]
        plotCorrMatrix('HRP3_corr1.png', df0, labels=df0.columns)
        hrp = getRecBipart(cov, sortIx)
        
        return jsonify({'hrp_weights': hrp.tolist(), 'images': ['HRP3_corr0.png', 'HRP3_corr1.png']})
    
    else:
        return jsonify({'error': 'No valid data available'})

if __name__ == '__main__':
    app.run(debug=True)
