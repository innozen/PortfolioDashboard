from flask import Flask, render_template, request, jsonify
import yfinance as yf

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/quote')
def quote():
    ticker_symbol = request.args.get('ticker')
    if not ticker_symbol:
        return jsonify({'error': 'No ticker provided'}), 400

    try:
        ticker = yf.Ticker(ticker_symbol)
        
        # Avoid .info due to frequent 429 Too Many Requests errors.
        # Fall back to fast_info and history
        fast = ticker.fast_info
        
        try:
            current_price = fast['lastPrice']
            previous_close = fast['previousClose']
        except Exception:
            hist = ticker.history(period="5d")
            if hist.empty:
                return jsonify({'error': 'Invalid ticker or no data found'}), 404
            current_price = hist['Close'].iloc[-1]
            previous_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
            
        change = current_price - previous_close

        # Get dividend info
        dividends = ticker.dividends
        last_dividend = 0.0
        div_yield = 0.0
        frequency_num = 0
        
        if not dividends.empty:
            last_dividend = float(dividends.iloc[-1])
            try:
                # Calculate approximate trailing 12 months (TTM) yield
                import pandas as pd
                now = pd.Timestamp.now(tz=dividends.index.tz)
                one_year_ago = now - pd.DateOffset(years=1)
                
                # Frequency calculation (numeric)
                last_year_divs = dividends[dividends.index >= one_year_ago]
                count = len(last_year_divs)
                
                if count >= 10:
                    frequency_num = 1
                elif count >= 3:
                    frequency_num = 3
                elif count >= 2:
                    frequency_num = 6
                elif count >= 1:
                    frequency_num = 12
                else:
                    frequency_num = 0

                # Calculate NET Annualized Yield (Last Div * Annual Factor / Price * 0.85)
                # This matches dividend.com's methodology (Gross) but adjusts for tax.
                annual_factor = 0
                if frequency_num == 1: annual_factor = 12
                elif frequency_num == 3: annual_factor = 4
                elif frequency_num == 6: annual_factor = 2
                elif frequency_num == 12: annual_factor = 1
                
                if current_price > 0 and annual_factor > 0:
                    gross_yield = (last_dividend * annual_factor / current_price) * 100
                    div_yield = gross_yield * 0.85
            except Exception:
                pass

        return jsonify({
            'ticker': ticker_symbol.upper(),
            'currentPrice': round(current_price, 2),
            'dividendYield': round(div_yield, 2),
            'lastDividendNet': round(last_dividend * 0.85, 4),
            'frequency': frequency_num
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
