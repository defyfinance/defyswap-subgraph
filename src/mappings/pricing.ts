/* eslint-disable prefer-const */
import { Pair, Token, Bundle } from '../types/schema'
import { BigDecimal, Address } from '@graphprotocol/graph-ts/index'
import { ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD } from './helpers'

const WBNB_ADDRESS = '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83'
const BUSD_WBNB_PAIR = '0x077932dc0ae0db9ed1535d20977aee4fdf30bfec' // created block 589414
const DAI_WBNB_PAIR = '0x7ce31b1aac2ad59109d66605d25b52c067098858'  // created block 481116
const USDT_WBNB_PAIR = '0x514f584db02a6736a968100a2792d07783f6d77f' // created block 648115

export function getFtmPriceInUSD(): BigDecimal {
  // fetch ftm prices for each stablecoin
  let usdtPair = Pair.load(USDT_WBNB_PAIR) // usdt is token0
  let busdPair = Pair.load(BUSD_WBNB_PAIR) // busd is token0
  let daiPair = Pair.load(DAI_WBNB_PAIR)   // dai is token1

  // all 3 have been created
  if (daiPair !== null && busdPair !== null && usdtPair !== null) {
    let totalLiquidityBNB = daiPair.reserve0.plus(busdPair.reserve1).plus(usdtPair.reserve1)
    let daiWeight = daiPair.reserve0.div(totalLiquidityBNB)
    let busdWeight = busdPair.reserve1.div(totalLiquidityBNB)
    let usdtWeight = usdtPair.reserve1.div(totalLiquidityBNB)
    return daiPair.token1Price
      .times(daiWeight)
      .plus(busdPair.token0Price.times(busdWeight))
      .plus(usdtPair.token0Price.times(usdtWeight))
    // busd and usdt have been created
  } else if (busdPair !== null && usdtPair !== null) {
    let totalLiquidityBNB = busdPair.reserve1.plus(usdtPair.reserve1)
    let busdWeight = busdPair.reserve1.div(totalLiquidityBNB)
    let usdtWeight = usdtPair.reserve1.div(totalLiquidityBNB)
    return busdPair.token0Price.times(busdWeight).plus(usdtPair.token0Price.times(usdtWeight))
    // usdt is the only pair so far
  } else if (busdPair !== null) {
    return busdPair.token0Price
  } else if (usdtPair !== null) {
    return usdtPair.token0Price
  } else {
    return ZERO_BD
  }
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83', // WBNB
  // '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75', // BUSD
  '0x049d68029688eabf473097a2fc38ef61633a3c7a', // USDT
  '0x04068da6c83afcfa0e13ba15a6696662335d5b75', // USDC
  // '0x23396cf899ca06c4472205fc903bdb4de249d6fc', // UST
  '0x8d11ec38a3eb5e956b052f67da8bdc9bef8abf3e', // DAI
  // '0x4bd17003473389a42daf6a0a729f6fdb328bbbd7', // VAI
  // '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c', // BTCB
  '0x74b23882a30290451a17c44f4f05243b6b58c76d', // WFTM
  // '0x250632378e573c6be1ac2f97fcdf00515d0aa91b', // BFTM
]

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_FTM = BigDecimal.fromString('2')

/**
 * Search through graph to find derived Ftm per token.
 * @todo update to be derived FTM (add stablecoin estimates)
 **/
export function findFtmPerToken(token: Token): BigDecimal {
  if (token.id == WBNB_ADDRESS) {
    return ONE_BD
  }
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]))
    if (pairAddress.toHexString() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHexString())
      if (pair.token0 == token.id && pair.reserveFTM.gt(MINIMUM_LIQUIDITY_THRESHOLD_FTM)) {
        let token1 = Token.load(pair.token1)
        return pair.token1Price.times(token1.derivedFTM as BigDecimal) // return token1 per our token * Ftm per token 1
      }
      if (pair.token1 == token.id && pair.reserveFTM.gt(MINIMUM_LIQUIDITY_THRESHOLD_FTM)) {
        let token0 = Token.load(pair.token0)
        return pair.token0Price.times(token0.derivedFTM as BigDecimal) // return token0 per our token * FTM per token 0
      }
    }
  }
  return ZERO_BD // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedFTM.times(bundle.ftmPrice)
  let price1 = token1.derivedFTM.times(bundle.ftmPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0
      .times(price0)
      .plus(tokenAmount1.times(price1))
      .div(BigDecimal.fromString('2'))
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0)
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1)
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let price0 = token0.derivedFTM.times(bundle.ftmPrice)
  let price1 = token1.derivedFTM.times(bundle.ftmPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}
